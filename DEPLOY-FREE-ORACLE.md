# Free Deployment: Oracle Always Free

This guide deploys the complete Docker Compose stack on one Oracle Cloud Ubuntu VM. It keeps the BullMQ worker running, uses local persistent Postgres/Redis/Elasticsearch volumes, and serves the dashboard and API on one HTTPS hostname through Caddy.

## Important: free-tier limitations

Oracle's published Always Free allowance includes up to **2 Ampere A1 OCPUs and 12 GB RAM**, plus a combined **200 GB block-volume allowance**. This project fits on one A1 VM with a 50 GB boot volume and its existing Elasticsearch 512 MB heap. Select only resources explicitly marked **Always Free eligible**, stay within the published limits, and review the OCI cost estimator and usage page before creating anything.

Oracle Free Tier signup may request payment-card verification. Do not continue if you cannot accept the verification terms. Do not switch the tenancy to **Pay As You Go**, do not create any resource without an Always Free label, and do not treat the 30-day promotional credit as a free deployment plan. Oracle may reclaim an Always Free compute instance it classifies as idle; this is appropriate for an assignment/demo host, not a production uptime guarantee. The A1 shape can also be unavailable in some regions.

Render's free web services sleep after inactivity, its free Redis-compatible store is not persistent, and its free Postgres expires after 30 days. In addition, Render's free web services cannot send outbound SMTP on port 587, which this app uses for Ethereal. So Render's free plan is not suitable for demonstrating this scheduler reliably. Oracle is the most practical no-monthly-charge fit here, with the availability caveat above.

Official details: [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Oracle Free Tier](https://www.oracle.com/cloud/free/), [Oracle public IP requirements](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingpublicIPs.htm), and [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

## Which accounts to use

Use Pavani's accounts throughout. Do not sign in with Uday's accounts:

- **Oracle Cloud:** register using Pavani's own email and keep Pavani as the tenancy owner.
- **GitHub:** the private repo is `Pavaniangadi24/Email-Job-Scheduler`. Add a read-only deploy key to this repo while signed in as `Pavaniangadi24`.
- **DuckDNS:** sign in with Pavani's GitHub account and create a hostname for the VM.
- **Google Cloud OAuth:** create/use credentials owned by Pavani's Google account. Add Pavani's Google address as a test user if the consent screen is in Testing mode.
- **Slack:** create/install the Slack app in Pavani's workspace.

The Git author name does not choose a cloud account. When an external site asks you to sign in, check that the displayed account is Pavani before continuing.

## 1. Create the free VM

1. Sign up at [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) with Pavani's email. Complete the email and identity verification. If Oracle asks for a card and you cannot accept that requirement, stop here; do not attempt a paid upgrade.
2. Pick your **home region** carefully. Always Free capacity is tied to the tenancy/home region and cannot always be moved. If an A1 shape is temporarily out of capacity, try another availability domain in the same region or retry later; do not select a billable shape.
3. In Oracle Cloud Console, open **Compute → Instances → Create instance**.
4. Name it `pavani-outbox`.
5. Select an Ubuntu 24.04 image compatible with **Arm/Ampere A1**. Select the **VM.Standard.A1.Flex** shape and set **2 OCPUs, 12 GB memory**. Confirm the console marks the instance Always Free eligible before creating it.
6. Use the default 50 GB boot volume. Do not attach additional storage unless the console confirms it is within your Always Free total.
7. For networking, use **Create new virtual cloud network** or the **VCN with Internet Connectivity** wizard. Select a public subnet, enable a public IPv4 address, and save the displayed address as `VM_PUBLIC_IP`.
8. Generate/download an SSH key pair and store its private key securely on your Windows machine. Never upload or share the private key.
9. Create the VM. If the selected configuration is not marked Always Free eligible or the estimate is not zero, cancel and correct it rather than proceeding.

Oracle may provide a temporary public IP. If you later replace it, update DuckDNS and the OCI ingress rules. A reserved IP may have separate billing terms; use it only if the console confirms it is free for your tenancy.

## 2. Allow only required network traffic

In the VM's VCN **Security List** or **Network Security Group**, add inbound rules:

| Protocol | Port | Source |
|---|---:|---|
| TCP | 22 | Your current public IP only, written as `your.ip.address/32` |
| TCP | 80 | `0.0.0.0/0` |
| TCP | 443 | `0.0.0.0/0` |

SSH from Windows PowerShell, replacing the key path and IP:

```powershell
ssh -i "$env:USERPROFILE\Downloads\oracle-key.key" ubuntu@VM_PUBLIC_IP
```

If OpenSSH says the key permissions are too broad, restrict them in Windows file properties or use `icacls` to grant access only to your Windows user, then retry.

## 3. Install Docker on the VM

Run these commands **inside the SSH session on Ubuntu**. They follow Docker's official apt-repository installation steps:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Exit the SSH session and reconnect for the `docker` group change to take effect:

```bash
exit
```

Then connect again using the same PowerShell `ssh` command. Verify:

```bash
docker --version
docker compose version
docker info
```

If `docker info` says permission denied, reconnect once more. Do not install a second Docker daemon.

Set Elasticsearch's required Linux memory map limit and persist it over reboots:

```bash
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-outbox-elasticsearch.conf
sudo sysctl --system
```

Configure the Ubuntu host firewall as well as the OCI network rules:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

The OCI network rule should still restrict port 22 to your own IP. Docker-published container ports can bypass UFW rules, so treat the OCI VCN security list/NSG as the authoritative public firewall. Compose publishes only Caddy's ports 80/443 publicly; all application and data-service ports bind to loopback. If the site is unreachable, check the VCN security list/NSG; do not expose the database or queue ports to solve it.

## 4. Give the VM read-only access to Pavani's private GitHub repo

Create a repository-specific key on the VM:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "pavani-outbox-deploy" -f ~/.ssh/id_ed25519_outbox -N ""
cat ~/.ssh/id_ed25519_outbox.pub
```

Copy only the displayed `.pub` line. In a browser signed in as `Pavaniangadi24`, open the GitHub repository:

1. Open **Settings → Deploy keys → Add deploy key**.
2. Title it `Oracle Outbox VM`.
3. Paste the public key.
4. Leave **Allow write access** unchecked, then add the key.

Back in the VM, configure SSH:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_outbox
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config ~/.ssh/id_ed25519_outbox
ssh -T git@github.com
```

On the first connection, verify GitHub's displayed host-key fingerprint against GitHub's published SSH key fingerprints before accepting it. Then clone the exact Pavani-owned repository:

```bash
git clone git@github.com:Pavaniangadi24/Email-Job-Scheduler.git
cd Email-Job-Scheduler
git status --short --branch
```

The deploy key is read-only: code updates are pushed from Pavani's normal development machine/account, and the VM later runs `git pull origin main`.

## 5. Create Pavani's free HTTPS hostname

1. Open [DuckDNS](https://www.duckdns.org/) and sign in using Pavani's GitHub account, `Pavaniangadi24`.
2. Create a subdomain, for example `pavani-outbox`. The full hostname will be `pavani-outbox.duckdns.org`.
3. Set its IPv4 address to the VM's public IPv4 address. Keep the DuckDNS update token private; do not put it in this project's `.env` or GitHub.
4. From Windows PowerShell, verify the hostname resolves to the VM:

   ```powershell
   Resolve-DnsName pavani-outbox.duckdns.org -Type A
   ```

5. If the address changes, update DuckDNS. Avoid configuring an AAAA record unless IPv6 is enabled and reachable on the VM.

Caddy will use this public hostname to obtain and renew a certificate automatically. Ports 80 and 443 must be publicly reachable for certificate validation.

## 6. Set up OAuth for the public hostname

Use the chosen full hostname in all settings below. For example:

```text
DOMAIN=pavani-outbox.duckdns.org
```

### Google

Use Pavani's Google account:

1. In Google Cloud Console, configure the OAuth consent screen and add Pavani's sign-in address as a test user if the app is in Testing mode.
2. Create or edit a **Web application** OAuth client.
3. Add this authorized redirect URI, replacing the example hostname with yours:

   ```text
   https://pavani-outbox.duckdns.org/api/auth/google/callback
   ```

4. Copy the OAuth client ID and secret into the server's `.env` in the next step. Never put the client secret in frontend source or a Vite `VITE_` variable.

Google may require domain verification for app branding/consent-screen publication. A DuckDNS subdomain is useful for this assignment, but it is not a domain you own at the parent level; if Google Console refuses it for the consent-screen authorized-domain requirement, use a domain you own and can verify. Do not switch OAuth to an insecure HTTP callback.

### Slack (optional)

Use Pavani's Slack workspace:

1. Create or edit a Slack app.
2. Under **OAuth & Permissions**, add bot scopes `chat:write` and `incoming-webhook`.
3. Add this redirect URL, replacing the example hostname:

   ```text
   https://pavani-outbox.duckdns.org/api/integrations/slack/callback
   ```

4. Install/reinstall the app to the workspace. Add its client ID and secret to the server `.env`.

## 7. Create the server-only `.env`

Do **not** copy your Windows `.env` file to the VM and do not commit it. It has local settings and credentials. On the VM, make a new server configuration from the example:

```bash
cp .env.example .env
nano .env
```

Change the following values in the VM's `.env`; keep the other scheduling and SMTP host/port settings from the example. Do not include quotes around values. Do not paste secrets into chat, GitHub issues, or a recording.

```dotenv
NODE_ENV=production
DOMAIN=pavani-outbox.duckdns.org
WEB_ORIGIN=https://pavani-outbox.duckdns.org
VITE_API_URL=
POSTGRES_PASSWORD=PASTE_A_RANDOM_HEX_PASSWORD_HERE
SESSION_SECRET=PASTE_A_DIFFERENT_RANDOM_HEX_SECRET_HERE
GOOGLE_CLIENT_ID=PASTE_PAVANI_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=PASTE_PAVANI_GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=https://pavani-outbox.duckdns.org/api/auth/google/callback
SLACK_CLIENT_ID=PASTE_PAVANI_SLACK_CLIENT_ID
SLACK_CLIENT_SECRET=PASTE_PAVANI_SLACK_CLIENT_SECRET
SLACK_CALLBACK_URL=https://pavani-outbox.duckdns.org/api/integrations/slack/callback
ETHEREAL_USER=PASTE_ETHEREAL_USERNAME
ETHEREAL_PASS=PASTE_ETHEREAL_PASSWORD
COOKIE_SECURE=true
```

For a quick random value, run each command separately on the VM and paste its output only into the matching line in the VM's `.env`:

```bash
openssl rand -hex 24
openssl rand -hex 32
```

Use the first output for `POSTGRES_PASSWORD` and the second for `SESSION_SECRET`; they must be different. Hexadecimal passwords are URL-safe for the Compose-generated PostgreSQL URL. Keep `VITE_API_URL` **present but empty**: the browser will call `/api/...` on the same HTTPS hostname, and Caddy routes those paths to Express.

`DATABASE_URL`, `REDIS_URL`, and `ELASTICSEARCH_URL` in Compose are replaced with the container-network addresses. The API reads the public `WEB_ORIGIN` and OAuth callbacks from `.env`. Postgres, Redis, and Elasticsearch are not exposed publicly. Never put `DOMAIN` or OAuth secrets into a `VITE_*` variable.

Create an Ethereal test account on your trusted Windows checkout if you do not already have one:

```powershell
npm install
npm run ethereal:setup
```

Copy just the printed Ethereal username/password directly into the VM `.env` over your SSH terminal. Ethereal captures test mail; it does not deliver to real inboxes. Do not copy the entire local `.env`.

Save and exit nano with `Ctrl+O`, Enter, then `Ctrl+X`. Restrict file permissions:

```bash
chmod 600 .env
```

## 8. Start the public HTTPS deployment

From the repository root on the VM:

```bash
docker compose --profile production config --quiet
docker compose --profile production up --build -d
docker compose --profile production ps -a
```

`migrate` should finish with exit code 0. `postgres`, `redis`, `elasticsearch`, `api`, `web`, and `caddy` should be running; the data services should become healthy. First-time image builds can take several minutes. Docker is enabled at system boot, and long-running Compose services use `restart: unless-stopped`, so they start again after an ordinary VM reboot. The one-shot `migrate` service is intentionally not restarted; Compose runs it before API startup on a deployment update.

Check status and logs:

```bash
docker compose --profile production logs --tail=100 migrate
docker compose --profile production logs --tail=100 api
docker compose --profile production logs --tail=100 caddy
curl -fsS https://pavani-outbox.duckdns.org/health
```

The health request should return `{"status":"ok"}`. Open the following in a browser:

- App: `https://pavani-outbox.duckdns.org`
- Queue dashboard, after Google sign-in in the same browser: `https://pavani-outbox.duckdns.org/admin/queues`

Wait for Caddy to acquire the TLS certificate before testing Google or Slack OAuth. If it cannot obtain one, check that DuckDNS A resolves to the current VM IP and Oracle allows inbound TCP 80/443. Inspect Caddy logs; do not replace the callback with HTTP.

## 9. Update the deployment later

Push changes from the Pavani development account, then on the VM:

```bash
cd ~/Email-Job-Scheduler
git pull origin main
docker compose --profile production up --build -d
docker compose --profile production ps -a
```

Do not run `git clean`, delete `.env`, or change the project name/Compose volumes when updating. To restart only the API without deleting scheduled work:

```bash
docker compose --profile production restart api
```

Normal shutdown (preserves data):

```bash
docker compose --profile production down
```

Start again without rebuilding:

```bash
docker compose --profile production up -d
```

Never add `-v` to `docker compose down` unless you deliberately want to delete Postgres, Redis, Elasticsearch, and Caddy certificate data.

## 10. Verify account, cost, and security

- In OCI **Billing & Cost Management → Cost Analysis** and **Governance & Administration → Limits, Quotas and Usage**, confirm only the intended Always Free resources are used. Review this after creating the VM and periodically. If the estimate shows any charge or a resource is not Always Free eligible, stop and remove that resource before proceeding.
- Do not click **Upgrade to Pay As You Go**. The temporary signup credit is not the same as Always Free.
- Oracle Free Tier signup may require card verification; exact verification/authorization terms depend on Oracle and your region. If you cannot accept the signup terms, do not proceed.
- Oracle may reclaim an idle Always Free instance after a week under its published utilization rules. Keep separate backups if the data matters; free-tier availability and capacity are not guaranteed.
- Only Caddy ports 80/443 are public. SSH is restricted to your own IP in the Oracle network rule. Do not expose ports 4000, 5173, 5433, 6379, or 9200.
- The repo is private, but use a read-only GitHub deploy key, not a personal access token. Never commit `.env`, the Oracle SSH private key, DuckDNS token, OAuth secrets, or Ethereal credentials.
- Google and Slack OAuth clients/workspaces belong to Pavani. Confirm the callback host exactly matches the DuckDNS hostname and `WEB_ORIGIN`.

## If OCI Always Free is unavailable

If Oracle cannot provide the A1 shape in Pavani's home region, wait/retry or select another availability domain in that same region. Do not pick a paid shape. There is no reliable, no-card, forever-free service currently verified here that simultaneously provides an always-on BullMQ worker, persistent queue Redis, PostgreSQL, Elasticsearch, and outbound SMTP 587. Free web-hosting tiers usually sleep, expire databases, lose Redis contents on restart, or block SMTP; those behaviors conflict with this assignment's scheduler demo.
