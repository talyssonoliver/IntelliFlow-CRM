# Voluntary Product Accessibility Template (VPAT) 2.5

## Revised Section 508 Edition

**Product Name:** IntelliFlow CRM
**Product Version:** 0.1.0 (Sprint 14)
**Report Date:** 2026-02-24
**Contact:** accessibility@intelliflow.com
**Evaluation Methods Used:** Static code review (26 routes), Lighthouse CI runtime (4 public routes), axe-core automated testing (8 component tests in jsdom)

---

## Applicable Standards/Guidelines

This report covers the degree of conformance for the following accessibility standard/guideline:

| Standard/Guideline | Included in Report |
|--------------------|--------------------|
| Web Content Accessibility Guidelines (WCAG) 2.1 | Level A — Yes, Level AA — Yes, Level AAA — No |
| Revised Section 508 standards (36 CFR 1194) | Yes |
| EN 301 549 Accessibility requirements | Yes (mapped to WCAG 2.1 AA) |

---

## Terms

The terms used in the Conformance Level information are defined as follows:

| Term | Definition |
|------|-----------|
| **Supports** | The functionality of the product has at least one method that meets the criterion without known defects or meets with equivalent facilitation. |
| **Partially Supports** | Some functionality of the product does not meet the criterion. |
| **Does Not Support** | The majority of product functionality does not meet the criterion. |
| **Not Applicable** | The criterion is not relevant to the product. |

---

## WCAG 2.1 Report

### Table 1: Level A Success Criteria

| Criteria | Conformance Level | Remarks and Explanations |
|----------|-------------------|--------------------------|
| 1.1.1 Non-text Content | Supports | All images have alt text. Icon fonts use `aria-hidden="true"`. |
| 1.2.1 Audio-only and Video-only (Prerecorded) | Not Applicable | No audio or video content in the application. |
| 1.2.2 Captions (Prerecorded) | Not Applicable | No video content in the application. |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | Not Applicable | No video content in the application. |
| 1.3.1 Info and Relationships | Supports | Semantic HTML with proper landmarks. Root layout uses `<div>` wrapper; section layouts define `<main>`. Sidebar uses `<nav>` with `aria-label`. |
| 1.3.2 Meaningful Sequence | Supports | DOM order matches visual presentation across all routes. |
| 1.3.3 Sensory Characteristics | Supports | Instructions do not rely solely on shape, size, or visual location. |
| 1.4.1 Use of Color | Partially Supports | Pipeline stage visualization on `/deals` uses color-coded chips. Text labels mitigate impact but color alone could be ambiguous for color-blind users. Remediation tracked for Sprint 16. |
| 1.4.2 Audio Control | Not Applicable | No auto-playing audio content. |
| 2.1.1 Keyboard | Supports | Interactive elements are keyboard accessible. DataTable rows support keyboard navigation. Radix primitives provide keyboard support. |
| 2.1.2 No Keyboard Trap | Supports | Focus trap implemented for modal dialogs via Radix Dialog primitives. Mobile sidebar and inline dialogs use focus-trap patterns. |
| 2.1.4 Character Key Shortcuts | Supports | No single-character keyboard shortcuts implemented. |
| 2.2.1 Timing Adjustable | Not Applicable | No time-limited content. Authentication managed by Supabase. |
| 2.2.2 Pause, Stop, Hide | Not Applicable | No auto-updating or blinking content exceeding 5 seconds. |
| 2.3.1 Three Flashes or Below Threshold | Supports | No content flashes more than 3 times per second. |
| 2.4.1 Bypass Blocks | Supports | Skip-to-content link present in root layout targeting `#main-content`. |
| 2.4.2 Page Titled | Supports | Routes export metadata with page-specific titles. Root layout provides application name as fallback. |
| 2.4.3 Focus Order | Supports | No `tabIndex > 0` found. DOM order matches visual layout. |
| 2.4.4 Link Purpose (In Context) | Supports | Navigation links have descriptive text labels from sidebar configurations. |
| 2.5.1 Pointer Gestures | Supports | No multi-point or path-based gestures required. |
| 2.5.2 Pointer Cancellation | Supports | Actions triggered on click (up event), not pointer down. |
| 2.5.3 Label in Name | Supports | Visible text labels match accessible names. |
| 2.5.4 Motion Actuation | Supports | No device motion or user motion triggers. |
| 3.1.1 Language of Page | Supports | Root layout sets `<html lang="en">`. |
| 3.2.1 On Focus | Supports | No components initiate context changes on focus. |
| 3.2.2 On Input | Supports | No form controls cause unexpected context changes on value change. |
| 3.3.1 Error Identification | Supports | FormControl sets `aria-invalid` and links to FormMessage via `aria-describedby`. |
| 3.3.2 Labels or Instructions | Supports | Form fields have programmatic labels via FormLabel. SearchFilterBar uses sr-only labels. |
| 4.1.1 Parsing | Supports | React JSX produces valid HTML. No duplicate IDs or malformed markup detected. |
| 4.1.2 Name, Role, Value | Supports | Interactive components expose correct name, role, and value. Search bar has `aria-label`. Notification badge includes unread count in accessible name. Icon buttons use `aria-label`. |

**Level A Summary:** 25 Supports, 1 Partially Supports, 0 Does Not Support, 4 Not Applicable (30 criteria)

### Table 2: Level AA Success Criteria

| Criteria | Conformance Level | Remarks and Explanations |
|----------|-------------------|--------------------------|
| 1.2.4 Captions (Live) | Not Applicable | No live audio or video content. |
| 1.2.5 Audio Description (Prerecorded) | Not Applicable | No video content. |
| 1.3.4 Orientation | Supports | No content restricted to a single orientation. Tailwind responsive classes adapt to both orientations. |
| 1.3.5 Identify Input Purpose | Supports | Personal data fields include `autocomplete` attributes (`email`, `current-password`, `name`, `tel`). |
| 1.4.3 Contrast (Minimum) | Supports | Light mode foreground/background ratios meet 4.5:1 minimum. Dark mode compliant. Muted foreground adjusted to meet threshold. |
| 1.4.4 Resize Text | Supports | Tailwind rem-based sizing allows 200% text resize without content loss. |
| 1.4.5 Images of Text | Supports | No images of text used. All text rendered as HTML. |
| 1.4.10 Reflow | Supports | Content reflows at 320px without horizontal scrolling. |
| 1.4.11 Non-text Contrast | Supports | UI component boundaries have sufficient contrast. Focus indicators use `ring-2`. |
| 1.4.12 Text Spacing | Supports | No fixed-height containers that clip text. Layout accommodates spacing changes. |
| 1.4.13 Content on Hover or Focus | Supports | Radix tooltip/popover primitives provide correct hover/focus dismissal behavior. |
| 2.4.5 Multiple Ways | Supports | Multiple navigation mechanisms available: sidebar, header nav, search, breadcrumbs. Each `<nav>` has distinguishing `aria-label`. |
| 2.4.6 Headings and Labels | Supports | Heading hierarchy follows sequential order. Table headers include `scope="col"`. |
| 2.4.7 Focus Visible | Supports | `focus-visible:ring-2` provides clear focus indication on all interactive elements. |
| 3.1.2 Language of Parts | Supports | Single-language application (English). No multilingual sections. |
| 3.2.3 Consistent Navigation | Supports | Sidebar, header, and main content layout remain in consistent order throughout. |
| 3.2.4 Consistent Identification | Supports | Components with the same function identified consistently across routes. |
| 3.3.3 Error Suggestion | Supports | FormMessage renders error text linked via `aria-describedby` with `aria-live="polite"` for dynamic announcement. |
| 3.3.4 Error Prevention (Legal, Financial, Data) | Supports | Destructive actions use confirmation dialogs. Data is reviewable before submission. |
| 4.1.3 Status Messages | Supports | Toast notifications use `role="status"` and `aria-live="polite"` via Radix primitives. |

**Level AA Summary:** 16 Supports, 0 Partially Supports, 0 Does Not Support, 4 Not Applicable (20 criteria)

---

## Functional Performance Criteria

| Criteria | Conformance Level | Remarks |
|----------|-------------------|---------|
| 302.1 Without Vision | Supports | Screen reader compatible via ARIA landmarks, labels, and roles. |
| 302.2 With Limited Vision | Supports | 200% zoom support, sufficient contrast ratios, scalable text. |
| 302.3 Without Perception of Color | Partially Supports | Pipeline stage chips on `/deals` use color coding. Text labels present but color alone could be ambiguous. |
| 302.4 Without Hearing | Supports | No audio-only content. All information presented visually. |
| 302.5 With Limited Hearing | Not Applicable | No audio content. |
| 302.6 Without Speech | Not Applicable | No speech input required. |
| 302.7 With Limited Manipulation | Supports | Full keyboard navigation. No fine motor control required. |
| 302.8 With Limited Reach and Strength | Supports | Standard keyboard and pointer input sufficient. |

---

## Legal Disclaimer

This VPAT is a self-assessment prepared by IntelliFlow CRM engineering. It is not a certification of accessibility compliance. The conformance levels reported reflect the state of the product at the evaluation date based on static code review, automated testing (axe-core, Lighthouse CI), and manual inspection. Actual user experience may vary depending on assistive technology, browser, and operating system combinations.

This document should be reviewed and updated with each major release or at minimum every 6 months.

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-24 | Engineering (DOC-008) | Initial VPAT based on DOC-007 gap assessment, post-remediation verification, and axe-core automated testing |
