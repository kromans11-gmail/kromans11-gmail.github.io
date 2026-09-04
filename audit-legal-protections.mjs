#!/usr/bin/env node
/**
 * Universal Web Project Legal & Security Protections Auditor
 *
 * Runs comprehensive automated checks against any web project (Astro, Next.js,
 * Vite, Svelte, static HTML) to verify legal compliance, anti-scam safeguards,
 * ADA/WCAG accessibility, privacy disclosures, and repository governance.
 *
 * Usage:
 *   node audit-legal-protections.mjs [project-dir]
 *   node audit-legal-protections.mjs [project-dir] --report compliance-report.md
 *   node audit-legal-protections.mjs [project-dir] --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let targetDir = '.';
let reportFile = null;
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--report' && args[i + 1]) {
    reportFile = args[++i];
  } else if (args[i] === '--json') {
    jsonOutput = true;
  } else if (!args[i].startsWith('--')) {
    targetDir = args[i];
  }
}

const ROOT = path.resolve(process.cwd(), targetDir);

// Helper functions for inspecting the target project
function fileExists(relPath) {
  try {
    return fs.existsSync(path.join(ROOT, relPath));
  } catch {
    return false;
  }
}

function readFileContent(relPath) {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  } catch {
    return '';
  }
}

function findFiles(dirRel, extensions, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];
  const fullDir = path.join(ROOT, dirRel);
  if (!fs.existsSync(fullDir)) return [];
  let results = [];
  try {
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.astro' || entry.name === 'dist') {
        continue;
      }
      const rel = path.join(dirRel, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(findFiles(rel, extensions, maxDepth, currentDepth + 1));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(rel);
      }
    }
  } catch {}
  return results;
}

// Find all HTML-like and CSS files in the project
const codeFiles = findFiles('.', ['.html', '.astro', '.jsx', '.tsx', '.vue', '.svelte', '.php'], 5);
const cssFiles = findFiles('.', ['.css', '.scss'], 5);
const allFiles = [...codeFiles, ...cssFiles];

// Helper to search across file sets
function searchInFiles(files, regex) {
  for (const rel of files) {
    const content = readFileContent(rel);
    if (regex.test(content)) return { found: true, file: rel };
  }
  return { found: false, file: null };
}

function findLegalFile(names) {
  for (const name of names) {
    if (fileExists(name)) return name;
    // Check inside src/pages, pages, public
    for (const prefix of ['src/pages', 'pages', 'public', 'src']) {
      const candidate = path.join(prefix, name);
      if (fileExists(candidate)) return candidate;
    }
  }
  return null;
}

// Audit results accumulator
const checks = [];

function check(id, category, title, testFn) {
  try {
    const res = testFn();
    checks.push({
      id,
      category,
      title,
      status: res.status, // 'PASS', 'WARN', 'FAIL', 'INFO'
      details: res.details,
      remediation: res.remediation || null,
      file: res.file || null,
    });
  } catch (err) {
    checks.push({
      id,
      category,
      title,
      status: 'FAIL',
      details: `Check error: ${err.message}`,
      remediation: 'Inspect the test execution.',
      file: null,
    });
  }
}

// ==========================================
// 1. REPOSITORY GOVERNANCE & OPEN-SOURCE LIABILITY
// ==========================================
check('GOV-01', 'Repository Governance', 'Open-Source License File (LICENSE)', () => {
  const licenseFile = findLegalFile(['LICENSE', 'LICENSE.md', 'LICENSE.txt']);
  if (!licenseFile) {
    return {
      status: 'FAIL',
      details: 'No LICENSE file found in repository root.',
      remediation: 'Add an open-source LICENSE (e.g. MIT) to disclaim warranties and limit liability.',
    };
  }
  const content = readFileContent(licenseFile);
  const hasDisclaimer = /WITHOUT WARRANTY OF ANY KIND/i.test(content) || /AS IS/i.test(content);
  const hasLiabilityLimit = /IN NO EVENT SHALL/i.test(content) || /LIMITATION OF LIABILITY/i.test(content);
  if (hasDisclaimer && hasLiabilityLimit) {
    return { status: 'PASS', details: `Valid license with warranty and liability disclaimer found (${licenseFile}).`, file: licenseFile };
  }
  return {
    status: 'WARN',
    details: `License found at ${licenseFile}, but warranty disclaimers appear incomplete.`,
    remediation: 'Ensure the standard all-caps AS IS and LIMITATION OF LIABILITY clauses are present.',
    file: licenseFile,
  };
});

check('GOV-02', 'Repository Governance', 'package.json License Field', () => {
  if (!fileExists('package.json')) return { status: 'INFO', details: 'No package.json in project (non-Node project).' };
  try {
    const pkg = JSON.parse(readFileContent('package.json'));
    if (pkg.license) {
      return { status: 'PASS', details: `package.json declares license: "${pkg.license}".` };
    }
    return {
      status: 'WARN',
      details: 'package.json has no "license" property.',
      remediation: 'Add "license": "MIT" (or appropriate SPDX identifier) to package.json.',
    };
  } catch {
    return { status: 'WARN', details: 'Could not parse package.json.' };
  }
});

check('GOV-03', 'Repository Governance', 'Security Policy & Anti-Extortion (SECURITY.md)', () => {
  const secFile = findLegalFile(['SECURITY.md', '.github/SECURITY.md']);
  if (!secFile) {
    return {
      status: 'FAIL',
      details: 'No SECURITY.md file found.',
      remediation: 'Create SECURITY.md defining responsible disclosure, safe harbor, and no-bounty policy.',
    };
  }
  const content = readFileContent(secFile);
  const hasNoBounty = /no.*bounty|do not offer.*reward|no.*monetary/i.test(content);
  const hasScope = /out.*of.*scope/i.test(content);
  const hasSafeHarbor = /safe.*harbor/i.test(content);
  if (hasNoBounty && hasScope && hasSafeHarbor) {
    return { status: 'PASS', details: `Comprehensive SECURITY.md found (${secFile}) with no-bounty, out-of-scope, and safe harbor rules.`, file: secFile };
  }
  return {
    status: 'WARN',
    details: `SECURITY.md exists (${secFile}), but may lack explicit no-bounty or out-of-scope scanner exclusions.`,
    remediation: 'Add explicit sections for No Cash Bounties, Automated Scanner Exclusions, and Safe Harbor.',
    file: secFile,
  };
});

// ==========================================
// 2. TERMS OF SERVICE & LITIGATION SHIELDS
// ==========================================
const termsFile = findLegalFile(['terms.astro', 'terms.html', 'terms.md', 'terms.jsx', 'terms.tsx', 'terms/index.astro', 'terms/index.html']);

check('TOS-01', 'Terms of Service', 'Terms of Service Page Existence', () => {
  if (termsFile) {
    return { status: 'PASS', details: `Terms of Service page found (${termsFile}).`, file: termsFile };
  }
  return {
    status: 'FAIL',
    details: 'No Terms of Service page detected.',
    remediation: 'Create a /terms/ page containing limitation of liability, disclaimers, and user terms.',
  };
});

check('TOS-02', 'Terms of Service', 'AS-IS Warranty & Limitation of Liability Disclaimers', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  const hasAsIs = /AS IS/i.test(content) && /WITHOUT WARRANTIES/i.test(content);
  const hasLimit = /LIMITATION OF LIABILITY/i.test(content) || /IN NO EVENT SHALL/i.test(content);
  if (hasAsIs && hasLimit) {
    return { status: 'PASS', details: 'Robust AS-IS warranty and liability caps found in Terms.', file: termsFile };
  }
  return {
    status: 'FAIL',
    details: 'Missing explicit AS-IS or Limitation of Liability clauses in Terms.',
    remediation: 'Add capitalized disclaimers expressly disclaiming direct, consequential, and punitive damages.',
    file: termsFile,
  };
});

check('TOS-03', 'Terms of Service', 'Dispute Resolution: Mandatory 30-Day Informal Notice', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/informal resolution|30.*days|notice.*dispute/i.test(content)) {
    return { status: 'PASS', details: 'Mandatory informal resolution notice period found in Terms.', file: termsFile };
  }
  return {
    status: 'WARN',
    details: 'No informal dispute resolution requirement found in Terms.',
    remediation: 'Require claimants to give 30 days written notice to resolve issues before filing legal actions.',
    file: termsFile,
  };
});

check('TOS-04', 'Terms of Service', 'Class Action Waiver', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/class action waiver|class.*action.*member/i.test(content)) {
    return { status: 'PASS', details: 'Enforceable Class Action Waiver found in Terms.', file: termsFile };
  }
  return {
    status: 'FAIL',
    details: 'No Class Action Waiver found in Terms.',
    remediation: 'Add a Class Action Waiver requiring claims to be litigated or arbitrated individually.',
    file: termsFile,
  };
});

check('TOS-05', 'Terms of Service', 'Governing Law & Exclusive Venue/Jurisdiction', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/governing law/i.test(content) && (/court/i.test(content) || /jurisdiction/i.test(content))) {
    return { status: 'PASS', details: 'Governing law and exclusive forum selection clause found.', file: termsFile };
  }
  return {
    status: 'FAIL',
    details: 'Missing Governing Law and Venue selection in Terms.',
    remediation: 'Specify your home state/county courts to prevent predatory out-of-state forum shopping.',
    file: termsFile,
  };
});

check('TOS-06', 'Terms of Service', 'Minimum Age & Eligibility (13+ / COPPA Compliance)', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/13 years of age|under.*13|minimum age|eligibility/i.test(content)) {
    return { status: 'PASS', details: 'Minimum age eligibility requirement (13+) found in Terms.', file: termsFile };
  }
  return {
    status: 'WARN',
    details: 'No age restriction clause found in Terms.',
    remediation: 'Require users to be at least 13 years old to safeguard against COPPA minor liability.',
    file: termsFile,
  };
});

check('TOS-07', 'Terms of Service', 'FTC Non-Commercial & No-Affiliate Disclosure (16 CFR Part 255)', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/FTC|affiliate|commercial.*disclosure|sponsored/i.test(content)) {
    return { status: 'PASS', details: 'FTC 16 CFR Part 255 commercial / affiliate relationship disclosure found.', file: termsFile };
  }
  return {
    status: 'WARN',
    details: 'No FTC commercial or affiliate disclosure found.',
    remediation: 'State clearly whether your project receives commissions, sponsorships, or is strictly non-commercial.',
    file: termsFile,
  };
});

check('TOS-08', 'Terms of Service', 'Copyright & DMCA Delisting Procedure (Notice & Takedown)', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/delisting|takedown|dmca|infringement/i.test(content)) {
    return { status: 'PASS', details: 'Notice-and-Takedown / Delisting procedure present in Terms.', file: termsFile };
  }
  return {
    status: 'FAIL',
    details: 'No clear DMCA or copyright takedown procedure in Terms.',
    remediation: 'Provide a clear form, email, or issue template for copyright owners to request content delisting.',
    file: termsFile,
  };
});

check('TOS-09', 'Terms of Service', 'Zero Tolerance for CSAM & Mandatory Law Enforcement Reporting', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/CSAM|child sexual abuse|NCMEC|2258A/i.test(content)) {
    return { status: 'PASS', details: 'Zero-tolerance CSAM / child safety clause with NCMEC reporting found.', file: termsFile };
  }
  return {
    status: 'WARN',
    details: 'No explicit CSAM zero-tolerance or NCMEC reporting clause found.',
    remediation: 'Add a clause confirming compliance with 18 U.S.C. § 2258A and zero-tolerance for illegal material.',
    file: termsFile,
  };
});

check('TOS-10', 'Terms of Service', 'Nominative Fair Use Trademark Notice', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/nominative|fair use|property of their respective owners|trademark/i.test(content)) {
    return { status: 'PASS', details: 'Nominative fair use trademark notice found in Terms.', file: termsFile };
  }
  return {
    status: 'WARN',
    details: 'No trademark disclaimer found.',
    remediation: 'State that all product names/logos are property of respective owners and used solely for identification.',
    file: termsFile,
  };
});

check('TOS-11', 'Terms of Service', 'Section 230 Communications Decency Act Immunity (47 U.S.C. § 230)', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/230|Communications Decency Act|interactive computer service/i.test(content)) {
    return { status: 'PASS', details: 'Section 230 CDA immunity clause protecting against third-party content liability found.', file: termsFile };
  }
  return {
    status: 'WARN',
    details: 'No Section 230 Communications Decency Act immunity clause detected in Terms.',
    remediation: 'Cite 47 U.S.C. § 230 interactive computer service immunity to shield against user comments/reviews defamation liability.',
    file: termsFile,
  };
});

check('TOS-12', 'Terms of Service', 'U.S. Copyright Office Registered Designated Agent (17 U.S.C. § 512)', () => {
  if (!termsFile) return { status: 'FAIL', details: 'Terms of Service missing.' };
  const content = readFileContent(termsFile);
  if (/DMCA-\d+|Designated Agent.*Copyright Office/i.test(content)) {
    return { status: 'PASS', details: 'Official U.S. Copyright Office Designated Agent registration details found.', file: termsFile };
  }
  return {
    status: 'WARN',
    details: 'No official US Copyright Office registration number (DMCA-xxxxxxx) found in Terms.',
    remediation: 'Register with the Copyright Office DMCA directory and publish your registration number and contact details.',
    file: termsFile,
  };
});

// ==========================================
// 3. PRIVACY POLICY & DATA REGULATION
// ==========================================
const privacyFile = findLegalFile(['privacy.astro', 'privacy.html', 'privacy.md', 'privacy.jsx', 'privacy.tsx', 'privacy/index.astro', 'privacy/index.html']);

check('PRIV-01', 'Privacy Policy', 'Privacy Policy Page Existence', () => {
  if (privacyFile) {
    return { status: 'PASS', details: `Privacy Policy page found (${privacyFile}).`, file: privacyFile };
  }
  return {
    status: 'FAIL',
    details: 'No Privacy Policy page detected.',
    remediation: 'Create a /privacy/ page detailing data collection, cookies, and user rights.',
  };
});

check('PRIV-02', 'Privacy Policy', 'Client-Side Storage Disclosed (localStorage / Cookies / Cache)', () => {
  if (!privacyFile) return { status: 'FAIL', details: 'Privacy Policy missing.' };
  const content = readFileContent(privacyFile);
  if (/localStorage|cookie|cache storage|local data/i.test(content)) {
    return { status: 'PASS', details: 'Client-side storage mechanisms disclosed in Privacy Policy.', file: privacyFile };
  }
  return {
    status: 'WARN',
    details: 'No explicit disclosure of client-side storage found.',
    remediation: 'Detail what keys are saved in localStorage, cookies, or cache, and how users can clear them.',
    file: privacyFile,
  };
});

check('PRIV-03', 'Privacy Policy', 'Cookieless / EU ePrivacy Directive Statement', () => {
  if (!privacyFile) return { status: 'FAIL', details: 'Privacy Policy missing.' };
  const content = readFileContent(privacyFile);
  if (/cookie banner|ePrivacy|strictly necessary/i.test(content)) {
    return { status: 'PASS', details: 'EU ePrivacy Directive & cookie banner exemption explanation found.', file: privacyFile };
  }
  return {
    status: 'WARN',
    details: 'No explanation of why a cookie banner is omitted or how ePrivacy is complied with.',
    remediation: 'Explain that storage is strictly necessary for technical functionality, disarming cookie complaint trolls.',
    file: privacyFile,
  };
});

check('PRIV-04', 'Privacy Policy', 'GDPR & CCPA User Rights Disclosed', () => {
  if (!privacyFile) return { status: 'FAIL', details: 'Privacy Policy missing.' };
  const content = readFileContent(privacyFile);
  if (/GDPR|CCPA|user rights|data choices|delete/i.test(content)) {
    return { status: 'PASS', details: 'GDPR and CCPA rights and deletion options disclosed.', file: privacyFile };
  }
  return {
    status: 'WARN',
    details: 'No reference to GDPR or CCPA statutory rights.',
    remediation: 'Describe how users can request deletion, access, or withdrawal of submitted data.',
    file: privacyFile,
  };
});

check('PRIV-05', 'Privacy Policy', 'Children’s Privacy (COPPA - Under 13 Notice)', () => {
  if (!privacyFile) return { status: 'FAIL', details: 'Privacy Policy missing.' };
  const content = readFileContent(privacyFile);
  if (/children|under.*13|COPPA/i.test(content)) {
    return { status: 'PASS', details: 'COPPA child privacy policy clearly stated.', file: privacyFile };
  }
  return {
    status: 'WARN',
    details: 'No children\'s privacy notice in Privacy Policy.',
    remediation: 'State that the service does not knowingly collect personal data from children under 13.',
    file: privacyFile,
  };
});

check('PRIV-06', 'Privacy Policy', 'Anti-Wiretap & Session Replay Disclaimer (CIPA / State Wiretap Laws)', () => {
  if (!privacyFile) return { status: 'FAIL', details: 'Privacy Policy missing.' };
  const content = readFileContent(privacyFile);
  if (/session replay|keystroke|wiretap|CIPA|eavesdrop/i.test(content)) {
    return { status: 'PASS', details: 'Explicit anti-wiretap & session replay disclaimer found (shields against CIPA arbitration shakedowns).', file: privacyFile };
  }
  return {
    status: 'WARN',
    details: 'No explicit disclaimer regarding session replay, keystroke logging, or wiretapping found.',
    remediation: 'Affirm that your site does not record user keystrokes or use session replay surveillance scripts.',
    file: privacyFile,
  };
});

check('PRIV-07', 'Privacy Policy', 'Statutory "Do Not Sell or Share" Declaration (CCPA / CPRA & TDPSA)', () => {
  if (!privacyFile) return { status: 'FAIL', details: 'Privacy Policy missing.' };
  const content = readFileContent(privacyFile);
  if (/not sell.*share|never sold.*rented|cross-context behavioral/i.test(content)) {
    return { status: 'PASS', details: 'Statutory non-sale and non-sharing declaration found in Privacy Policy.', file: privacyFile };
  }
  return {
    status: 'WARN',
    details: 'No statutory "Do Not Sell or Share" declaration detected in Privacy Policy.',
    remediation: 'Declare affirmatively that you do not sell personal data or share it for cross-context behavioral ads.',
    file: privacyFile,
  };
});

// ==========================================
// 4. ACCESSIBILITY (ADA & WCAG 2.1/2.2 AA)
// ==========================================
check('A11Y-01', 'Accessibility (ADA)', 'Skip-to-Content Landmark Link', () => {
  const match = searchInFiles(codeFiles, /href=["']#main["']|<a[^>]+class=["'][^"']*skip/i);
  if (match.found) {
    return { status: 'PASS', details: `Skip-to-content landmark link found in ${match.file}.`, file: match.file };
  }
  return {
    status: 'FAIL',
    details: 'No skip-to-content link (<a href="#main" class="skip-link">) detected.',
    remediation: 'Add a skip-link at the top of the body for keyboard/screen-reader navigation (WCAG 2.4.1).',
  };
});

check('A11Y-02', 'Accessibility (ADA)', 'Main Landmark (<main id="main">)', () => {
  const match = searchInFiles(codeFiles, /<main[^>]+id=["']main["']|<main[^>]+role=["']main["']/i);
  if (match.found) {
    return { status: 'PASS', details: `Target <main id="main"> landmark found in ${match.file}.`, file: match.file };
  }
  return {
    status: 'WARN',
    details: 'Main element with id="main" not found.',
    remediation: 'Add id="main" to the primary <main> container to serve as the skip-link destination.',
  };
});

check('A11Y-03', 'Accessibility (ADA)', 'High-Contrast Keyboard Focus Styles (:focus-visible)', () => {
  const match = searchInFiles(allFiles, /:focus-visible/);
  if (match.found) {
    return { status: 'PASS', details: `:focus-visible styling found in ${match.file}.`, file: match.file };
  }
  return {
    status: 'FAIL',
    details: 'No :focus-visible rules found.',
    remediation: 'Add high-contrast :focus-visible outlines to CSS for WCAG 2.4.7 focus appearance compliance.',
  };
});

check('A11Y-04', 'Accessibility (ADA)', 'Reduced Motion Query (prefers-reduced-motion)', () => {
  const match = searchInFiles(allFiles, /prefers-reduced-motion/);
  if (match.found) {
    return { status: 'PASS', details: `Reduced-motion handling found in ${match.file}.`, file: match.file };
  }
  return {
    status: 'WARN',
    details: 'No prefers-reduced-motion media query detected.',
    remediation: 'Disable smooth-scrolling and long animations for users with vestibular sensitivities (WCAG 2.3.3).',
  };
});

check('A11Y-05', 'Accessibility (ADA)', 'Accessibility Statement Page', () => {
  const a11yFile = findLegalFile(['accessibility.astro', 'accessibility.html', 'accessibility.md', 'accessibility/index.astro']);
  if (a11yFile) {
    return { status: 'PASS', details: `Accessibility statement found (${a11yFile}).`, file: a11yFile };
  }
  return {
    status: 'WARN',
    details: 'No dedicated /accessibility/ statement page found.',
    remediation: 'Create an Accessibility Statement affirming WCAG 2.1 AA goals with a barrier reporting email.',
  };
});

// ==========================================
// 5. SECURITY & CRAWLER HYGIENE
// ==========================================
check('SEC-01', 'Security & Privacy', 'Cross-Origin Referrer Policy Meta Tag', () => {
  const match = searchInFiles(codeFiles, /name=["']referrer["'][^>]+content=["']strict-origin/i);
  if (match.found) {
    return { status: 'PASS', details: `strict-origin-when-cross-origin referrer meta tag found in ${match.file}.`, file: match.file };
  }
  return {
    status: 'WARN',
    details: 'No strict-origin-when-cross-origin referrer meta tag found.',
    remediation: 'Add <meta name="referrer" content="strict-origin-when-cross-origin" /> to prevent leaking URL paths to external sites.',
  };
});

check('SEC-02', 'Security & Privacy', 'Robots.txt Presence & Sitemap Link', () => {
  const robotsFile = findLegalFile(['robots.txt', 'public/robots.txt']);
  if (!robotsFile) {
    return {
      status: 'WARN',
      details: 'No robots.txt detected in project root or public/ directory.',
      remediation: 'Add public/robots.txt specifying crawl rules and Sitemap URL.',
    };
  }
  const content = readFileContent(robotsFile);
  const hasSitemap = /sitemap/i.test(content);
  return {
    status: 'PASS',
    details: `robots.txt found (${robotsFile})${hasSitemap ? ' with Sitemap declared.' : ' (Consider adding Sitemap: directive).'}.`,
    file: robotsFile,
  };
});

check('SEC-03', 'Security & Privacy', 'Outbound External Links rel="noopener"', () => {
  const match = searchInFiles(codeFiles, /target=["']_blank["']/i);
  if (!match.found) {
    return { status: 'PASS', details: 'No target="_blank" links found, or none insecurely opened.' };
  }
  // Check if rel="noopener" is used
  const noopenerMatch = searchInFiles(codeFiles, /target=["']_blank["'][^>]+rel=["'][^"']*noopener/i);
  if (noopenerMatch.found) {
    return { status: 'PASS', details: `External links use rel="noopener" safely (${noopenerMatch.file}).`, file: noopenerMatch.file };
  }
  return {
    status: 'WARN',
    details: 'Detected target="_blank" links without explicit rel="noopener".',
    remediation: 'Add rel="noopener" to all external links to prevent window.opener hijacking.',
  };
});

// ==========================================
// 6. ANTI-SCAM & CONTENT DEFENSES
// ==========================================
check('SCAM-01', 'Anti-Scam & Safety', 'External Destination / Non-Hosting Notice', () => {
  const match = searchInFiles(codeFiles, /external app|does not host|external software|opens.*new tab/i);
  if (match.found) {
    return { status: 'PASS', details: `Outbound external destination notice found in ${match.file}.`, file: match.file };
  }
  return {
    status: 'WARN',
    details: 'No external destination or non-hosting notice detected near outbound links.',
    remediation: 'Clearly label links that open external third-party software to reinforce non-hosting protections.',
  };
});

check('SCAM-02', 'Anti-Scam & Safety', 'Notice-and-Action Content Flagging Mechanism', () => {
  const match = searchInFiles(codeFiles, /flag.*comment|report.*comment|report.*problem|warn-btn|warn-form/i);
  if (match.found) {
    return { status: 'PASS', details: `Notice-and-Action flagging mechanism found in ${match.file}.`, file: match.file };
  }
  return {
    status: 'WARN',
    details: 'No user reporting / flagging button detected for user-generated content.',
    remediation: 'Add a 1-click report button on user comments/posts to satisfy EU DSA notice-and-action rules.',
  };
});

check('TRDM-01', 'Anti-Scam & Safety', 'Common-Law Trademark & Brand Notice (™)', () => {
  const match = searchInFiles(codeFiles, /™|&trade;|&#8482;|common-law trademark/i);
  if (match.found) {
    return { status: 'PASS', details: `Proprietary trademark notice / ™ symbol found in ${match.file}.`, file: match.file };
  }
  return {
    status: 'WARN',
    details: 'No ™ symbol or proprietary brand notice detected in layout or code.',
    remediation: 'Append ™ to your primary brand name and assert common-law trademark rights in Terms.',
  };
});

// ==========================================
// OUTPUT GENERATION
// ==========================================

const passed = checks.filter((c) => c.status === 'PASS').length;
const warnings = checks.filter((c) => c.status === 'WARN').length;
const failures = checks.filter((c) => c.status === 'FAIL').length;
const total = checks.length;
const score = Math.round((passed / (total - checks.filter((c) => c.status === 'INFO').length)) * 100);

if (jsonOutput) {
  console.log(JSON.stringify({ score, passed, warnings, failures, total, checks }, null, 2));
  process.exit(failures > 0 ? 1 : 0);
}

// Terminal Output
console.log('\n=============================================================');
console.log('  🛡️  WEB PROJECT LEGAL & SECURITY PROTECTIONS AUDITOR');
console.log(`  Target Directory: ${ROOT}`);
console.log('=============================================================\n');

const categories = [...new Set(checks.map((c) => c.category))];

for (const cat of categories) {
  console.log(`📁 \x1b[1m${cat.toUpperCase()}\x1b[0m`);
  const catChecks = checks.filter((c) => c.category === cat);
  for (const c of catChecks) {
    let badge = '\x1b[32m[ PASS ]\x1b[0m';
    if (c.status === 'WARN') badge = '\x1b[33m[ WARN ]\x1b[0m';
    if (c.status === 'FAIL') badge = '\x1b[31m[ FAIL ]\x1b[0m';
    if (c.status === 'INFO') badge = '\x1b[36m[ INFO ]\x1b[0m';

    console.log(`  ${badge} ${c.id}: ${c.title}`);
    console.log(`         \x1b[2m${c.details}\x1b[0m`);
    if (c.remediation && (c.status === 'FAIL' || c.status === 'WARN')) {
      console.log(`         👉 \x1b[33mFix: ${c.remediation}\x1b[0m`);
    }
  }
  console.log('');
}

console.log('-------------------------------------------------------------');
console.log(`  Compliance Score: \x1b[1m${score}%\x1b[0m (${passed} Passed, ${warnings} Warnings, ${failures} Failed)`);
console.log('-------------------------------------------------------------');

console.log('\n📋 OFF-CODE ADMINISTRATIVE CHECKLIST:');
console.log('  [ ] 1. Domain Registrar WHOIS Privacy: Enable WHOIS Privacy at your domain registrar.');
console.log('  [ ] 2. U.S. Copyright Office Registration: Register Designated Agent at copyright.gov/dmca-directory ($6/3 yrs).');
console.log('  [ ] 3. Business Contact Endpoint: Ensure legal@ or dmca@ address is monitored.\n');

if (reportFile) {
  const mdLines = [
    '# Web Project Legal & Security Compliance Report',
    '',
    `**Target Directory:** \`${ROOT}\`  `,
    `**Audit Date:** ${new Date().toISOString()}  `,
    `**Overall Score:** **${score}%** (${passed} Passed, ${warnings} Warnings, ${failures} Failed)`,
    '',
    '## Detailed Results',
    '',
    '| ID | Category | Check | Status | Details | Remediation |',
    '|---|---|---|---|---|---|',
  ];

  for (const c of checks) {
    const icon = c.status === 'PASS' ? '✅ PASS' : c.status === 'WARN' ? '⚠️ WARN' : c.status === 'FAIL' ? '❌ FAIL' : 'ℹ️ INFO';
    mdLines.push(`| \`${c.id}\` | ${c.category} | ${c.title} | ${icon} | ${c.details.replace(/\|/g, '-')} | ${c.remediation ? c.remediation.replace(/\|/g, '-') : 'N/A'} |`);
  }

  mdLines.push('', '## Off-Code Administrative Items', '');
  mdLines.push('- [ ] **WHOIS Privacy Protection**: Verify your registrar shields personal home address and phone.');
  mdLines.push('- [ ] **U.S. Copyright Office Registration**: File $6 Designated Agent at [copyright.gov/dmca-directory](https://www.copyright.gov/dmca-directory/).');
  mdLines.push('- [ ] **Monitored Legal Contact**: Ensure an official email address is routed to the maintainer.');

  fs.writeFileSync(path.resolve(process.cwd(), reportFile), mdLines.join('\n'), 'utf8');
  console.log(`\x1b[32m✓ Markdown report written to: ${reportFile}\x1b[0m\n`);
}

process.exit(failures > 0 ? 1 : 0);
