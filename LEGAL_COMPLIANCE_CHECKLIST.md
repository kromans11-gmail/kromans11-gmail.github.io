# Web Project Legal, Security & Anti-Scam Compliance Checklist

This standard checklist and its companion automated audit tool (`audit-legal-protections.mjs`) protect web apps, SaaS tools, and public directories against predatory litigation, copyright extortion, ADA accessibility claims, privacy regulatory fines, and bug bounty scams.

---

## Quick Start: Auditing Any Web Project

The automated audit tool requires no external dependencies (runs on Node.js 18+). You can copy `audit-legal-protections.mjs` into any project or run it against any directory:

```bash
# Audit the current project
node audit-legal-protections.mjs

# Audit any other project on your machine
node audit-legal-protections.mjs /path/to/other-project

# Generate a Markdown compliance report
node audit-legal-protections.mjs /path/to/other-project --report compliance-report.md

# Output JSON for CI/CD pipelines
node audit-legal-protections.mjs /path/to/other-project --json
```

---

## Master Checklist: The 28 Essential Protections

### 1. Repository Governance & Open-Source Liability
- [x] **`LICENSE` File in Root**: Must contain standard all-caps **AS IS**, **WITHOUT WARRANTY OF ANY KIND**, and **LIMITATION OF LIABILITY** clauses (e.g., MIT or Apache 2.0). Protects you from claims if someone forks, runs, or clones your code.
- [x] **`package.json` License Field**: Explicit SPDX license identifier (e.g., `"license": "MIT"`).
- [x] **Security Policy (`SECURITY.md`)**:
  - Defines a private responsible disclosure channel (GitHub Security Advisories or direct email).
  - **Explicit No-Bounty / Anti-Extortion Clause**: States clearly that the project does *not* offer cash bounties or swag, deterring "beg bounty" extortion.
  - **Out-of-Scope Exclusions**: Excludes automated scanner dumps, public client-side API keys, and missing headers on static pages.
  - **Safe Harbor Guarantee**: Confirms authorized status for good-faith security researchers.

---

### 2. Terms of Service & Litigation Shields (`/terms/`)
- [x] **Nature of Service / Non-Hosting Intermediary Disclaimer**: Clarifies whether the service hosts software or merely links to third-party web destinations.
- [x] **AS-IS Warranty & Liability Caps**: Disclaims implied warranties of merchantability, fitness, uptime, and limits liability for consequential, indirect, or punitive damages.
- [x] **Mandatory 30-Day Informal Dispute Resolution**: Requires claimants to provide written notice and 30 business days to resolve issues in good faith before initiating formal arbitration or litigation.
- [x] **Binding Class Action Waiver**: Requires all disputes to be brought individually, barring class or consolidated lawsuits.
- [x] **Governing Law & Exclusive Forum Selection**: Specifies your home state and county court, preventing out-of-state "forum shopping."
- [x] **Minimum Age Requirement (13+ / COPPA)**: Requires users to be at least 13 (or 16 in the EEA) to shield against child privacy claims.
- [x] **FTC Commercial & Endorsement Disclosure (16 CFR Part 255)**: Discloses whether the site accepts affiliate commissions, sponsored rankings, or paid placements.
- [x] **Notice-and-Takedown / DMCA Delisting Procedure**: Provides an issue form or email for copyright and trademark owners to request prompt delisting.
- [x] **Zero Tolerance for CSAM & NCMEC Reporting**: Explicit prohibition of Child Sexual Abuse Material with mandatory law enforcement and NCMEC reporting under 18 U.S.C. § 2258A.
- [x] **Nominative Fair Use Trademark Notice**: Clarifies that third-party logos and names belong to respective owners and are used solely for identification.

---

### 3. Privacy Policy & Data Regulation (`/privacy/`)
- [x] **Client-Side Storage Disclosure**: Specifies every key in `localStorage`, cookies, or Cache Storage, their exact purpose, and how users can delete them.
- [x] **EU ePrivacy Directive Statement (Why No Cookie Banner)**: Explains that because only strictly necessary functional storage is used (no ad tracking or cross-site profiling), no cookie pop-up banner is required under Directive 2002/58/EC and UK PECR.
- [x] **Analytics Disclosure**: Discloses aggregate analytics tools (e.g. GoatCounter, Plausible) and confirms whether IP addresses are anonymized without persistent tracking.
- [x] **Statutory Rights (GDPR & CCPA)**: Details how users can exercise deletion, opt-out, or data access rights.
- [x] **Children's Privacy (COPPA)**: Confirms the site does not knowingly collect personal data from children under 13, with parental takedown procedures.
- [x] **Third-Party Remote Asset / IP Disclosure**: Informs users when preview images or fonts load from external publisher servers, with `referrerpolicy="no-referrer"`.

---

### 4. Accessibility (ADA Title III & WCAG 2.1/2.2 AA)
- [x] **Skip-to-Content Link**: `<a href="#main" class="skip-link">` as the first focusable element for screen-reader and keyboard users (WCAG 2.4.1).
- [x] **Main Landmark**: Target `<main id="main">` for accessible navigation.
- [x] **High-Contrast Keyboard Focus**: Visible `:focus-visible` outline styles with sufficient color contrast (WCAG 2.4.7).
- [x] **Reduced Motion Query**: `@media (prefers-reduced-motion: reduce)` to disable smooth scrolling and non-essential animations (WCAG 2.3.3).
- [x] **Accessibility Statement Page (`/accessibility/`)**: Formal statement of WCAG 2.1 AA goals and a monitored email channel to report accessibility barriers.

---

### 5. Link Safety & Anti-Scam Architecture
- [x] **Cross-Origin Referrer Policy**: `<meta name="referrer" content="strict-origin-when-cross-origin" />` to prevent leaking internal paths to external websites.
- [x] **Outbound Links Hardened**: All external links use `rel="noopener"` (or `rel="noreferrer"`).
- [x] **Outbound Destination Disclaimers**: Clear visual notice on external software links stating the destination opens outside your service.
- [x] **URL Parameter Sanitization**: Automated stripping of affiliate and tracking parameters (`utm_*`, `ref`, `aff`, `fbclid`, `gclid`) from submitted URLs.
- [x] **Notice-and-Action Comment Flagging**: Direct flagging button on user comments to satisfy EU Digital Services Act (DSA) safe harbor.

---

### 6. Crawlers & Infrastructure
- [x] **`public/robots.txt`**: Declares crawler permissions and points to the sitemap/feed.
- [x] **Database Input Hardening**: Database constraints on slug lengths, character regex (`^[a-z0-9-]+$`), and input boundaries to block injection and storage bloat.

---

### 7. Off-Code Administrative Tasks
- [ ] **Domain Registrar WHOIS Privacy**: Log in to your domain registrar and ensure WHOIS Privacy Protection is active.
- [ ] **U.S. Copyright Office Registration**: Register your Designated Agent at [copyright.gov/dmca-directory](https://www.copyright.gov/dmca-directory/) ($6 for 3 years) to guarantee statutory DMCA Safe Harbor immunity.
- [ ] **Monitored Legal Endpoint**: Ensure `legal@` or `dmca@` is forwarded to an active inbox.
