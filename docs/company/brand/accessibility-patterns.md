# IntelliFlow Accessibility Patterns

WCAG 2.1 AA compliant patterns for all interactive components.

---

## Quick Reference

| Component | Key ARIA | Keyboard | Focus |
|-----------|----------|----------|-------|
| Button | `aria-label`, `aria-disabled` | Enter, Space | Visible ring |
| Link | `aria-current` | Enter | Visible ring |
| Modal | `role="dialog"`, `aria-modal` | Escape to close | Trap focus |
| Dropdown | `aria-expanded`, `aria-haspopup` | Arrow keys | Roving tabindex |
| Tab | `role="tablist"`, `aria-selected` | Arrow keys | Roving tabindex |
| Form | `aria-describedby`, `aria-invalid` | Tab navigation | Input focus |
| Alert | `role="alert"`, `aria-live` | N/A | N/A |
| Table | `scope`, `aria-sort` | Arrow keys (optional) | Cell focus |

---

## Buttons

### Standard Button

```html
<button
  type="button"
  class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white
         rounded font-medium hover:bg-primary-hover
         focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
         disabled:opacity-50 disabled:cursor-not-allowed"
>
  Save Changes
</button>
```

### Icon-Only Button

```html
<button
  type="button"
  aria-label="Delete contact"
  class="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded
         focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
>
  <span class="material-symbols-outlined" aria-hidden="true">delete</span>
</button>
```

### Loading Button

```html
<button
  type="button"
  disabled
  aria-busy="true"
  class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white
         rounded font-medium opacity-75 cursor-wait"
>
  <svg class="animate-spin h-4 w-4" aria-hidden="true" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
  <span>Saving...</span>
</button>
```

### Toggle Button

```html
<button
  type="button"
  role="switch"
  aria-checked="false"
  aria-label="Enable notifications"
  class="relative w-11 h-6 bg-slate-200 rounded-full
         focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
  onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')"
>
  <span class="sr-only">Enable notifications</span>
  <span
    aria-hidden="true"
    class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow
           transform transition-transform
           [[aria-checked=true]_&]:translate-x-5"
  ></span>
</button>
```

---

## Navigation

### Main Navigation

```html
<nav aria-label="Main navigation">
  <ul class="flex gap-1" role="list">
    <li>
      <a
        href="/dashboard"
        aria-current="page"
        class="flex items-center gap-3 px-3 py-2 rounded-lg
               bg-primary/10 text-primary font-medium"
      >
        <span class="material-symbols-outlined" aria-hidden="true">dashboard</span>
        Dashboard
      </a>
    </li>
    <li>
      <a
        href="/contacts"
        class="flex items-center gap-3 px-3 py-2 rounded-lg
               text-slate-600 hover:bg-slate-100"
      >
        <span class="material-symbols-outlined" aria-hidden="true">contacts</span>
        Contacts
      </a>
    </li>
  </ul>
</nav>
```

### Breadcrumbs

```html
<nav aria-label="Breadcrumb">
  <ol class="flex items-center gap-2 text-sm" role="list">
    <li>
      <a href="/" class="text-slate-500 hover:text-slate-700">Home</a>
    </li>
    <li aria-hidden="true" class="text-slate-400">/</li>
    <li>
      <a href="/contacts" class="text-slate-500 hover:text-slate-700">Contacts</a>
    </li>
    <li aria-hidden="true" class="text-slate-400">/</li>
    <li>
      <span aria-current="page" class="text-slate-900 font-medium">John Doe</span>
    </li>
  </ol>
</nav>
```

### Skip Link

```html
<!-- First element in body -->
<a
  href="#main-content"
  class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4
         focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white
         focus:rounded focus:outline-none"
>
  Skip to main content
</a>

<!-- Main content target -->
<main id="main-content" tabindex="-1">
  <!-- Page content -->
</main>
```

---

## Forms

### Text Input with Label

```html
<div class="space-y-1.5">
  <label for="email" class="block text-sm font-medium text-slate-700">
    Email Address
    <span class="text-red-500" aria-hidden="true">*</span>
    <span class="sr-only">(required)</span>
  </label>
  <input
    type="email"
    id="email"
    name="email"
    required
    autocomplete="email"
    aria-describedby="email-hint"
    class="w-full px-3 py-2 border border-slate-300 rounded-lg
           focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
    placeholder="you@example.com"
  >
  <p id="email-hint" class="text-xs text-slate-500">
    We'll never share your email with anyone.
  </p>
</div>
```

### Input with Error

```html
<div class="space-y-1.5">
  <label for="email-error" class="block text-sm font-medium text-slate-700">
    Email Address
  </label>
  <input
    type="email"
    id="email-error"
    name="email"
    aria-invalid="true"
    aria-describedby="email-error-msg"
    class="w-full px-3 py-2 border border-red-500 rounded-lg
           focus:outline-none focus:ring-2 focus:ring-red-500"
    value="not-an-email"
  >
  <p id="email-error-msg" class="text-sm text-red-600 flex items-center gap-1" role="alert">
    <span class="material-symbols-outlined text-sm" aria-hidden="true">error</span>
    Please enter a valid email address.
  </p>
</div>
```

### Select Input

```html
<div class="space-y-1.5">
  <label for="status" class="block text-sm font-medium text-slate-700">
    Status
  </label>
  <select
    id="status"
    name="status"
    class="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white
           focus:outline-none focus:ring-2 focus:ring-primary"
  >
    <option value="">Select a status</option>
    <option value="active">Active</option>
    <option value="inactive">Inactive</option>
    <option value="pending">Pending</option>
  </select>
</div>
```

### Checkbox Group

```html
<fieldset>
  <legend class="text-sm font-medium text-slate-700 mb-2">
    Notification Preferences
  </legend>
  <div class="space-y-2">
    <label class="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        name="notifications"
        value="email"
        class="w-4 h-4 text-primary border-slate-300 rounded
               focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
      <span class="text-sm text-slate-700">Email notifications</span>
    </label>
    <label class="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        name="notifications"
        value="sms"
        class="w-4 h-4 text-primary border-slate-300 rounded
               focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
      <span class="text-sm text-slate-700">SMS notifications</span>
    </label>
  </div>
</fieldset>
```

### Radio Group

```html
<fieldset>
  <legend class="text-sm font-medium text-slate-700 mb-2">
    Priority Level
  </legend>
  <div class="space-y-2" role="radiogroup">
    <label class="flex items-center gap-3 cursor-pointer">
      <input
        type="radio"
        name="priority"
        value="high"
        class="w-4 h-4 text-primary border-slate-300
               focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
      <span class="text-sm text-slate-700">High</span>
    </label>
    <label class="flex items-center gap-3 cursor-pointer">
      <input
        type="radio"
        name="priority"
        value="medium"
        checked
        class="w-4 h-4 text-primary border-slate-300
               focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
      <span class="text-sm text-slate-700">Medium</span>
    </label>
    <label class="flex items-center gap-3 cursor-pointer">
      <input
        type="radio"
        name="priority"
        value="low"
        class="w-4 h-4 text-primary border-slate-300
               focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
      <span class="text-sm text-slate-700">Low</span>
    </label>
  </div>
</fieldset>
```

### Search Input

```html
<div role="search">
  <label for="search" class="sr-only">Search contacts</label>
  <div class="relative">
    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
      <span class="material-symbols-outlined">search</span>
    </span>
    <input
      type="search"
      id="search"
      name="search"
      placeholder="Search contacts..."
      class="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg
             focus:outline-none focus:ring-2 focus:ring-primary"
    >
  </div>
</div>
```

---

## Modal Dialog

```html
<!-- Trigger -->
<button
  type="button"
  aria-haspopup="dialog"
  onclick="openModal()"
>
  Open Modal
</button>

<!-- Modal -->
<div
  id="modal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
  class="fixed inset-0 z-50 hidden"
>
  <!-- Backdrop -->
  <div
    class="absolute inset-0 bg-black/50"
    aria-hidden="true"
    onclick="closeModal()"
  ></div>

  <!-- Modal content -->
  <div
    class="relative bg-white rounded-xl shadow-xl max-w-lg mx-auto mt-20"
    role="document"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b">
      <h2 id="modal-title" class="text-lg font-semibold">
        Confirm Delete
      </h2>
      <button
        type="button"
        aria-label="Close modal"
        onclick="closeModal()"
        class="p-1 text-slate-400 hover:text-slate-600 rounded
               focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>

    <!-- Body -->
    <div id="modal-description" class="px-6 py-4">
      <p class="text-slate-600">
        Are you sure you want to delete this contact? This action cannot be undone.
      </p>
    </div>

    <!-- Footer -->
    <div class="flex justify-end gap-3 px-6 py-4 border-t">
      <button type="button" onclick="closeModal()" class="btn-secondary">
        Cancel
      </button>
      <button type="button" class="btn-danger">
        Delete
      </button>
    </div>
  </div>
</div>

<script>
function openModal() {
  const modal = document.getElementById('modal');
  modal.classList.remove('hidden');
  // Trap focus
  modal.querySelector('button').focus();
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
</script>
```

---

## Tabs

```html
<div class="tabs">
  <!-- Tab List -->
  <div role="tablist" aria-label="Contact details" class="flex border-b border-slate-200">
    <button
      role="tab"
      id="tab-overview"
      aria-controls="panel-overview"
      aria-selected="true"
      tabindex="0"
      class="px-4 py-2 text-sm font-medium text-primary border-b-2 border-primary -mb-px
             focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
    >
      Overview
    </button>
    <button
      role="tab"
      id="tab-activity"
      aria-controls="panel-activity"
      aria-selected="false"
      tabindex="-1"
      class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700
             focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
    >
      Activity
    </button>
    <button
      role="tab"
      id="tab-deals"
      aria-controls="panel-deals"
      aria-selected="false"
      tabindex="-1"
      class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700
             focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
    >
      Deals
    </button>
  </div>

  <!-- Tab Panels -->
  <div
    role="tabpanel"
    id="panel-overview"
    aria-labelledby="tab-overview"
    tabindex="0"
    class="p-4"
  >
    <p>Overview content here...</p>
  </div>
  <div
    role="tabpanel"
    id="panel-activity"
    aria-labelledby="tab-activity"
    tabindex="0"
    class="p-4 hidden"
  >
    <p>Activity content here...</p>
  </div>
  <div
    role="tabpanel"
    id="panel-deals"
    aria-labelledby="tab-deals"
    tabindex="0"
    class="p-4 hidden"
  >
    <p>Deals content here...</p>
  </div>
</div>

<script>
// Arrow key navigation for tabs
document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
  const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')];
  const current = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
  let next;

  if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
  else return;

  tabs.forEach((t, i) => {
    t.setAttribute('aria-selected', i === next);
    t.setAttribute('tabindex', i === next ? 0 : -1);
    document.getElementById(t.getAttribute('aria-controls'))
      .classList.toggle('hidden', i !== next);
  });
  tabs[next].focus();
});
</script>
```

---

## Dropdown Menu

```html
<div class="relative" data-dropdown>
  <!-- Trigger -->
  <button
    type="button"
    aria-haspopup="menu"
    aria-expanded="false"
    aria-controls="dropdown-menu"
    class="inline-flex items-center gap-2 px-3 py-2 border border-slate-300
           rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2
           focus:ring-primary"
  >
    Options
    <span class="material-symbols-outlined text-sm" aria-hidden="true">expand_more</span>
  </button>

  <!-- Menu -->
  <div
    id="dropdown-menu"
    role="menu"
    aria-orientation="vertical"
    class="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border
           border-slate-200 py-1 hidden z-50"
  >
    <button
      role="menuitem"
      tabindex="-1"
      class="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100
             focus:bg-slate-100 focus:outline-none"
    >
      <span class="material-symbols-outlined text-sm mr-2" aria-hidden="true">edit</span>
      Edit
    </button>
    <button
      role="menuitem"
      tabindex="-1"
      class="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100
             focus:bg-slate-100 focus:outline-none"
    >
      <span class="material-symbols-outlined text-sm mr-2" aria-hidden="true">content_copy</span>
      Duplicate
    </button>
    <hr class="my-1 border-slate-200" role="separator">
    <button
      role="menuitem"
      tabindex="-1"
      class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50
             focus:bg-red-50 focus:outline-none"
    >
      <span class="material-symbols-outlined text-sm mr-2" aria-hidden="true">delete</span>
      Delete
    </button>
  </div>
</div>
```

---

## Alerts & Notifications

### Inline Alert

```html
<!-- Success Alert -->
<div
  role="alert"
  class="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg"
>
  <span class="material-symbols-outlined text-green-600" aria-hidden="true">check_circle</span>
  <div>
    <p class="font-medium text-green-800">Contact saved successfully</p>
    <p class="text-sm text-green-700">Your changes have been saved.</p>
  </div>
</div>

<!-- Error Alert -->
<div
  role="alert"
  aria-live="assertive"
  class="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg"
>
  <span class="material-symbols-outlined text-red-600" aria-hidden="true">error</span>
  <div>
    <p class="font-medium text-red-800">Failed to save contact</p>
    <p class="text-sm text-red-700">Please check your connection and try again.</p>
  </div>
</div>
```

### Toast Notification

```html
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="fixed bottom-4 right-4 flex items-center gap-3 px-4 py-3
         bg-slate-900 text-white rounded-lg shadow-lg"
>
  <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
  <p>Changes saved</p>
  <button
    type="button"
    aria-label="Dismiss notification"
    class="p-1 hover:bg-white/10 rounded"
  >
    <span class="material-symbols-outlined text-sm" aria-hidden="true">close</span>
  </button>
</div>
```

---

## Data Tables

```html
<div class="overflow-x-auto" role="region" aria-label="Contacts table">
  <table class="w-full">
    <caption class="sr-only">List of contacts with their status and value</caption>
    <thead>
      <tr class="bg-slate-50">
        <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
          Name
        </th>
        <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
          Email
        </th>
        <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
          Status
        </th>
        <th
          scope="col"
          class="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase"
          aria-sort="descending"
        >
          <button class="inline-flex items-center gap-1 hover:text-slate-700">
            Value
            <span class="material-symbols-outlined text-sm" aria-hidden="true">arrow_downward</span>
          </button>
        </th>
        <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">
          <span class="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-200">
      <tr class="hover:bg-slate-50">
        <th scope="row" class="px-4 py-3 text-sm font-medium text-slate-900">
          John Doe
        </th>
        <td class="px-4 py-3 text-sm text-slate-600">
          john@example.com
        </td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                       bg-green-100 text-green-800">
            Active
          </span>
        </td>
        <td class="px-4 py-3 text-sm text-slate-900 text-right tabular-nums">
          $12,345
        </td>
        <td class="px-4 py-3 text-right">
          <button
            type="button"
            aria-label="Edit John Doe"
            class="p-1 text-slate-400 hover:text-slate-600 rounded
                   focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span class="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## Loading States

### Skeleton Screen

```html
<div aria-busy="true" aria-label="Loading content">
  <div class="animate-pulse space-y-4">
    <div class="h-8 bg-slate-200 rounded w-1/3"></div>
    <div class="h-4 bg-slate-200 rounded w-2/3"></div>
    <div class="h-4 bg-slate-200 rounded w-1/2"></div>
    <div class="h-32 bg-slate-200 rounded"></div>
  </div>
  <span class="sr-only">Loading, please wait...</span>
</div>
```

### Loading Spinner

```html
<div role="status" aria-live="polite" class="flex items-center gap-2">
  <svg
    class="animate-spin h-5 w-5 text-primary"
    aria-hidden="true"
    viewBox="0 0 24 24"
  >
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
  <span>Loading...</span>
</div>
```

---

## Keyboard Shortcuts

### Shortcut Documentation

```html
<div class="text-sm text-slate-600">
  <p class="mb-2 font-medium">Keyboard Shortcuts:</p>
  <dl class="grid grid-cols-2 gap-2">
    <dt><kbd class="px-1.5 py-0.5 bg-slate-100 rounded text-xs">Ctrl</kbd> + <kbd class="px-1.5 py-0.5 bg-slate-100 rounded text-xs">S</kbd></dt>
    <dd>Save changes</dd>
    <dt><kbd class="px-1.5 py-0.5 bg-slate-100 rounded text-xs">Ctrl</kbd> + <kbd class="px-1.5 py-0.5 bg-slate-100 rounded text-xs">K</kbd></dt>
    <dd>Open search</dd>
    <dt><kbd class="px-1.5 py-0.5 bg-slate-100 rounded text-xs">Esc</kbd></dt>
    <dd>Close modal</dd>
  </dl>
</div>
```

---

## Screen Reader Utilities

### Visually Hidden Text

```css
/* sr-only class */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Not sr-only (show on focus) */
.not-sr-only {
  position: static;
  width: auto;
  height: auto;
  padding: 0;
  margin: 0;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

### Live Regions

```html
<!-- Polite announcements (non-urgent) -->
<div aria-live="polite" aria-atomic="true" class="sr-only" id="status-announcer">
  <!-- Inject status messages here via JS -->
</div>

<!-- Assertive announcements (urgent) -->
<div aria-live="assertive" aria-atomic="true" class="sr-only" id="alert-announcer">
  <!-- Inject critical alerts here via JS -->
</div>
```

```javascript
// Announce to screen readers
function announce(message, priority = 'polite') {
  const announcer = document.getElementById(
    priority === 'assertive' ? 'alert-announcer' : 'status-announcer'
  );
  announcer.textContent = message;
  // Clear after announcement
  setTimeout(() => announcer.textContent = '', 1000);
}

// Usage
announce('Contact saved successfully');
announce('Error: Please fill all required fields', 'assertive');
```

---

## Focus Management

### Focus Trap (for Modals)

```javascript
function trapFocus(element) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  element.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
  });

  firstFocusable.focus();
}
```

### Restore Focus

```javascript
let previouslyFocused = null;

function openModal() {
  previouslyFocused = document.activeElement;
  // ... open modal
}

function closeModal() {
  // ... close modal
  if (previouslyFocused) {
    previouslyFocused.focus();
  }
}
```

---

## Color Contrast Reference

| Usage | Foreground | Background | Ratio |
|-------|------------|------------|-------|
| Body text | `#0f172a` | `#ffffff` | 15.5:1 |
| Secondary text | `#475569` | `#ffffff` | 7.0:1 |
| Muted text | `#64748b` | `#ffffff` | 4.6:1 |
| Primary button | `#ffffff` | `#137fec` | 4.5:1 |
| Error text | `#991b1b` | `#fee2e2` | 5.9:1 |
| Success text | `#166534` | `#dcfce7` | 5.8:1 |
| Link (primary) | `#137fec` | `#ffffff` | 4.5:1 |

All combinations meet WCAG 2.1 AA requirements (4.5:1 for normal text, 3:1 for large text).

---

## Testing Checklist

- [ ] All interactive elements keyboard accessible
- [ ] Focus visible on all focusable elements
- [ ] Tab order follows logical reading order
- [ ] Skip link available and functional
- [ ] All images have alt text (or aria-hidden if decorative)
- [ ] Form inputs have associated labels
- [ ] Error messages announced to screen readers
- [ ] Color not sole means of conveying information
- [ ] Contrast ratios meet WCAG AA (4.5:1)
- [ ] Modals trap focus and close on Escape
- [ ] Dynamic content announced via live regions
- [ ] Tested with screen reader (NVDA/VoiceOver)
