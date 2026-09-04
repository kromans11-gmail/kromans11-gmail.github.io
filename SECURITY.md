# Security Policy

## Overview

Web App Finder ([`webappfinder.app`](https://webappfinder.app)) is an independent, non-commercial, open-source discovery directory for Progressive Web Apps (PWAs). The site is statically generated and hosted via GitHub Pages, with lightweight community features (voting, reviews, problem reporting) connected to Supabase using PostgreSQL Row Level Security (RLS).

We take the security and integrity of our directory seriously and appreciate responsible security research conducted in good faith.

---

## Reporting a Security Vulnerability

If you discover a security vulnerability in the Web App Finder website, infrastructure scripts, or Supabase backend policies, please report it privately:

1. **GitHub Private Vulnerability Reporting (Preferred)**: Navigate to the [Security Advisories tab](https://github.com/kromans11-gmail/kromans11-gmail.github.io/security/advisories) on GitHub and click **"Report a vulnerability"**.
2. **Email**: If you are unable to use GitHub Security Advisories, contact the project maintainer at `kromans11@gmail.com` with the subject line `[SECURITY] Web App Finder Vulnerability Report`.

Please include in your report:
- A description of the issue and its potential impact.
- Clear, step-by-step instructions or proof-of-concept (PoC) code to reproduce the issue.
- Any suggestions for remediation.

We strive to acknowledge receipt of legitimate security reports within **48–72 hours**.

---

## ⚠️ Bug Bounty & Extortion Policy (Notice to Researchers)

**Web App Finder is a free, hobbyist, open-source project with no commercial revenue, funding, or corporate backing.**

- **We DO NOT offer monetary compensation, cash rewards, bug bounties, swag, or certificates of recognition under any circumstances.**
- Demands for payment, requests for "hall of fame" certificates, or threats of public disclosure / extortion ("beg bounties") will be ignored, rejected, and reported to GitHub Abuse and your email provider's fraud desk.
- Please do not submit low-effort or automated scanner reports in the hope of receiving a payout.

---

## Out-of-Scope Items

To prevent wasted effort on known non-issues, the following items are strictly **out of scope**:

1. **Automated Scanner Dumps**: Unverified outputs or raw logs from automated scanners (e.g., OWASP ZAP, Nessus, Nikto, Burp Suite, SSL Labs) without an actionable, demonstrated proof-of-concept showing real security risk.
2. **Public Supabase Anon API Key**: In accordance with Supabase architecture, the public anonymous key (`anon` key) embedded in client-side code is intended to be public. Backend access is strictly secured via PostgreSQL Row Level Security (RLS) policies. Reports pointing out that the anon key is in client-side JavaScript will be closed as invalid.
3. **Missing HTTP Security Headers**: Missing headers such as `Content-Security-Policy`, `X-Frame-Options`, `Permissions-Policy`, or `Strict-Transport-Security` on static informational GitHub Pages where no authenticated user sessions or sensitive credentials exist.
4. **Email & DNS Records**: SPF, DKIM, or DMARC record recommendations on domains that do not send outbound transactional email.
5. **TLS / SSL Configuration**: Ciphers, TLS protocols, or certificate settings managed upstream by GitHub Pages or Cloudflare infrastructure.
6. **Denial of Service (DoS / DDoS)**: Volume-based attacks or rate-limit testing against GitHub Pages, Supabase endpoints, or third-party websites.
7. **Third-Party External Apps**: Security vulnerabilities located on third-party websites or PWAs cataloged in our directory. We do not own, operate, or host external apps. Report external app vulnerabilities directly to the respective app publisher, or use our **Report a Problem** button on the app's detail page or our [Delisting Request Form](https://github.com/kromans11-gmail/kromans11-gmail.github.io/issues/new?template=delist-app.yml) if an app is actively malicious.
8. **Theoretical Attacks**: Attacks requiring impossible user interactions, physical access to an unlocked device, or compromised browser environments.

---

## Safe Harbor

We consider security research to be authorized and will not initiate legal action against you provided that you:
- Act in good faith and avoid privacy violations, degradation of user experience, or disruption to production systems.
- Do not access, modify, delete, or exfiltrate user data or submission records.
- Give us reasonable time to investigate and address the vulnerability before publicly disclosing any details.
- Comply with all applicable laws and do not engage in extortion or blackmail.

Thank you for helping keep the open-source web and PWA community safe!
