'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

// Step configuration
type StepId = 'personal' | 'company' | 'additional';

interface Step {
  id: StepId;
  number: number;
  label: string;
}

const steps: Step[] = [
  { id: 'personal', number: 1, label: 'Personal Details' },
  { id: 'company', number: 2, label: 'Company & Role' },
  { id: 'additional', number: 3, label: 'Additional Info' },
];

// Contact status type
type ContactStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

// Form data structure
interface ContactFormData {
  // Step 1: Personal Details
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  zipCode: string;
  // Step 2: Company & Role
  company: string;
  jobTitle: string;
  department: string;
  departmentOther: string;
  linkedIn: string;
  // Step 3: Additional Info
  contactType: string;
  contactTypeOther: string;
  status: ContactStatus;
  tags: string;
  notes: string;
}

const initialFormData: ContactFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  streetAddress: '',
  city: '',
  zipCode: '',
  company: '',
  jobTitle: '',
  department: '',
  departmentOther: '',
  linkedIn: '',
  contactType: '',
  contactTypeOther: '',
  status: 'ACTIVE',
  tags: '',
  notes: '',
};

// Contact type options
const contactTypeOptions = [
  { value: '', label: 'Select a type...' },
  { value: 'customer', label: 'Customer' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'partner', label: 'Partner' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'investor', label: 'Investor' },
  { value: 'other', label: 'Other' },
];

// Department options
const departmentOptions = [
  { value: '', label: 'Select a department...' },
  { value: 'executive', label: 'Executive / C-Suite' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'product', label: 'Product' },
  { value: 'operations', label: 'Operations' },
  { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'Human Resources' },
  { value: 'other', label: 'Other' },
];

// Status options
const statusOptions: { value: ContactStatus; label: string; description: string }[] = [
  { value: 'ACTIVE', label: 'Active', description: 'Currently engaged contact' },
  { value: 'INACTIVE', label: 'Inactive', description: 'Temporarily not engaged' },
  { value: 'ARCHIVED', label: 'Archived', description: 'No longer active' },
];

// Toast notification type
type ToastData = {
  open: boolean;
  variant: 'default' | 'destructive' | 'success';
  title: string;
  description: string;
};

export default function CreateNewContactPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<StepId>('personal');
  const [formData, setFormData] = useState<ContactFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastData>({
    open: false,
    variant: 'default',
    title: '',
    description: '',
  });

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  // tRPC mutation for creating contacts (IFC-089 integration)
  const createContact = trpc.contact.create.useMutation({
    onSuccess: () => {
      setToast({
        open: true,
        variant: 'success',
        title: 'Success!',
        description: 'Contact created successfully. Redirecting...',
      });

      // Redirect to contacts list after a short delay
      setTimeout(() => {
        router.push('/contacts');
      }, 1500);
    },
    onError: (error) => {
      console.error('Failed to create contact:', error.message);

      setToast({
        open: true,
        variant: 'destructive',
        title: 'Failed to create contact',
        description: error.message,
      });
    },
  });

  // Update form field
  const updateField = (field: keyof ContactFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Validate current step
  const validateStep = (): boolean => {
    const newErrors: Partial<Record<keyof ContactFormData, string>> = {};

    if (currentStep === 'personal') {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
      if (!formData.email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
      }
    }

    if (currentStep === 'company') {
      // Validate departmentOther when 'Other' is selected
      if (formData.department === 'other' && !formData.departmentOther.trim()) {
        newErrors.departmentOther = 'Please specify the department';
      }
    }

    if (currentStep === 'additional') {
      // Validate contactTypeOther when 'Other' is selected
      if (formData.contactType === 'other' && !formData.contactTypeOther.trim()) {
        newErrors.contactTypeOther = 'Please specify the contact type';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Navigate to next step
  const handleNextStep = () => {
    if (!validateStep()) return;

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  // Navigate to previous step
  const handlePrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateStep()) return;

    setIsSubmitting(true);
    try {
      // Helper to convert empty strings to undefined
      const toOptional = (value: string): string | undefined =>
        value.trim() ? value.trim() : undefined;

      // Parse comma-separated tags into array
      const parseTags = (tagsString: string): string[] =>
        tagsString
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0);

      // Map form data to API schema
      const contactData = {
        email: formData.email.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        title: toOptional(formData.jobTitle),
        phone: toOptional(formData.phone),
        department: formData.department === 'other'
          ? toOptional(formData.departmentOther)
          : toOptional(formData.department),
        streetAddress: toOptional(formData.streetAddress),
        city: toOptional(formData.city),
        zipCode: toOptional(formData.zipCode),
        company: toOptional(formData.company),
        linkedInUrl: toOptional(formData.linkedIn),
        contactType: formData.contactType === 'other'
          ? 'other' as const
          : (toOptional(formData.contactType) as 'customer' | 'prospect' | 'partner' | 'vendor' | 'investor' | undefined),
        status: formData.status,
        tags: parseTags(formData.tags),
        contactNotes: toOptional(formData.notes),
      };

      await createContact.mutateAsync(contactData);
      // Success handled by mutation onSuccess callback
    } catch (error) {
      // Error handled by mutation onError callback
      console.error('Mutation error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel and go back
  const handleCancel = () => {
    router.push('/contacts');
  };

  // Get step status for styling
  const getStepStatus = (step: Step): 'completed' | 'current' | 'upcoming' => {
    const stepIndex = steps.findIndex(s => s.id === step.id);
    if (stepIndex < currentStepIndex) return 'completed';
    if (stepIndex === currentStepIndex) return 'current';
    return 'upcoming';
  };

  // Navigate to a specific step by clicking on it
  const handleStepClick = (step: Step) => {
    const targetIndex = steps.findIndex(s => s.id === step.id);
    // Only allow navigating to completed steps or current step
    if (targetIndex <= currentStepIndex) {
      setCurrentStep(step.id);
    }
  };

  return (
    <ToastProvider>
      <div className="flex flex-col gap-8">
        {/* Breadcrumb */}
      <div className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex">
          <ol className="flex items-center space-x-2">
            <li>
              <Link href="/dashboard" className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] text-sm font-medium transition-colors">
                Dashboard
              </Link>
            </li>
            <li><span className="text-slate-300 dark:text-slate-600">/</span></li>
            <li>
              <Link href="/contacts" className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] text-sm font-medium transition-colors">
                Contacts
              </Link>
            </li>
            <li><span className="text-slate-300 dark:text-slate-600">/</span></li>
            <li>
              <span className="text-slate-900 dark:text-white text-sm font-medium">New Contact</span>
            </li>
          </ol>
        </nav>

        {/* Page Title */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Create New Contact</h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">Add a new person to your contact database.</p>
        </div>
      </div>

      {/* Form Card */}
      <Card className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Step Indicator */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-200 dark:border-slate-700">
          <div className="relative flex items-center justify-between w-full max-w-2xl mx-auto">
            {/* Progress Line */}
            <div className="absolute left-0 top-5 w-full h-0.5 bg-slate-100 dark:bg-slate-700 -z-10" />

            {steps.map((step) => {
              const status = getStepStatus(step);
              const isClickable = status === 'completed' || status === 'current';
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleStepClick(step)}
                  disabled={!isClickable}
                  className={`flex flex-col items-center gap-2 ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ring-4 ring-white dark:ring-slate-900 shadow-sm transition-all ${
                      status === 'current'
                        ? 'bg-[#137fec] text-white'
                        : status === 'completed'
                        ? 'bg-[#137fec] text-white hover:bg-[#0e6ac7]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-2 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {status === 'completed' ? (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    ) : (
                      step.number
                    )}
                  </div>
                  <span className={`text-sm font-medium ${
                    status === 'current'
                      ? 'font-bold text-slate-900 dark:text-white'
                      : status === 'completed'
                      ? 'font-bold text-slate-900 dark:text-white hover:text-[#137fec]'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}>
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <div className="p-8">
          <form onSubmit={(e) => { e.preventDefault(); }} className="flex flex-col gap-8">
            {/* Step 1: Personal Details */}
            {currentStep === 'personal' && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Contact Information</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">* Required fields</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* First Name */}
                  <div className="space-y-1.5">
                    <label htmlFor="firstName" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => updateField('firstName', e.target.value)}
                      placeholder="e.g. Sarah"
                      className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                        errors.firstName ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'
                      }`}
                    />
                    {errors.firstName && <p className="text-xs text-red-500">{errors.firstName}</p>}
                  </div>

                  {/* Last Name */}
                  <div className="space-y-1.5">
                    <label htmlFor="lastName" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => updateField('lastName', e.target.value)}
                      placeholder="e.g. Connor"
                      className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                        errors.lastName ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'
                      }`}
                    />
                    {errors.lastName && <p className="text-xs text-red-500">{errors.lastName}</p>}
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4 20q-.825 0-1.412-.587Q2 18.825 2 18V6q0-.825.588-1.412Q3.175 4 4 4h16q.825 0 1.413.588Q22 5.175 22 6v12q0 .825-.587 1.413Q20.825 20 20 20Zm8-7 8-5V6l-8 5-8-5v2Z" />
                        </svg>
                      </span>
                      <input
                        type="email"
                        id="email"
                        value={formData.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        placeholder="sarah@example.com"
                        className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                          errors.email ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'
                        }`}
                      />
                    </div>
                    {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label htmlFor="phone" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Phone Number
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.95 21q-3.125 0-6.175-1.362-3.05-1.363-5.55-3.863-2.5-2.5-3.862-5.55Q3 7.175 3 4.05q0-.45.3-.75t.75-.3H8.1q.35 0 .625.238.275.237.325.562l.65 3.5q.05.4-.025.675-.075.275-.275.475L6.65 11.2q.7 1.3 1.65 2.475.95 1.175 2.1 2.175l2.65-2.65q.225-.225.525-.325.3-.1.625-.025l3.3.7q.35.1.563.363.212.262.212.587v4.05q0 .45-.3.75t-.75.3Z" />
                        </svg>
                      </span>
                      <input
                        type="tel"
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => updateField('phone', e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                      />
                    </div>
                  </div>

                  {/* Street Address */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label htmlFor="streetAddress" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Street Address
                    </label>
                    <input
                      type="text"
                      id="streetAddress"
                      value={formData.streetAddress}
                      onChange={(e) => updateField('streetAddress', e.target.value)}
                      placeholder="1234 Market Street, Suite 500"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                    />
                  </div>

                  {/* City */}
                  <div className="space-y-1.5">
                    <label htmlFor="city" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      City
                    </label>
                    <input
                      type="text"
                      id="city"
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      placeholder="San Francisco"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                    />
                  </div>

                  {/* Zip Code */}
                  <div className="space-y-1.5">
                    <label htmlFor="zipCode" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Zip / Postal Code
                    </label>
                    <input
                      type="text"
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => updateField('zipCode', e.target.value)}
                      placeholder="94103"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Company & Role */}
            {currentStep === 'company' && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Company & Role</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Optional fields</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Company Name */}
                  <div className="space-y-1.5">
                    <label htmlFor="company" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Company Name
                    </label>
                    <input
                      type="text"
                      id="company"
                      value={formData.company}
                      onChange={(e) => updateField('company', e.target.value)}
                      placeholder="e.g. Acme Corporation"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                    />
                  </div>

                  {/* Job Title */}
                  <div className="space-y-1.5">
                    <label htmlFor="jobTitle" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Job Title
                    </label>
                    <input
                      type="text"
                      id="jobTitle"
                      value={formData.jobTitle}
                      onChange={(e) => updateField('jobTitle', e.target.value)}
                      placeholder="e.g. VP of Marketing"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                    />
                  </div>

                  {/* Department */}
                  <div className="space-y-1.5">
                    <label htmlFor="department" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Department
                    </label>
                    <div className="relative">
                      <select
                        id="department"
                        value={formData.department}
                        onChange={(e) => {
                          updateField('department', e.target.value);
                          // Clear departmentOther when switching away from 'other'
                          if (e.target.value !== 'other') {
                            updateField('departmentOther', '');
                          }
                        }}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                      >
                        {departmentOptions.map((option) => (
                          <option key={option.value} value={option.value} disabled={option.value === ''}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  {/* Other Department Specification - shown when 'Other' is selected */}
                  {formData.department === 'other' && (
                    <div className="space-y-1.5">
                      <label htmlFor="departmentOther" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Please specify the department <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="departmentOther"
                        value={formData.departmentOther}
                        onChange={(e) => updateField('departmentOther', e.target.value)}
                        placeholder="e.g. Legal, IT Support, Research..."
                        className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                          errors.departmentOther ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'
                        }`}
                      />
                      {errors.departmentOther && <p className="text-xs text-red-500">{errors.departmentOther}</p>}
                    </div>
                  )}

                  {/* LinkedIn */}
                  <div className="space-y-1.5">
                    <label htmlFor="linkedIn" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      LinkedIn Profile
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                        </svg>
                      </span>
                      <input
                        type="url"
                        id="linkedIn"
                        value={formData.linkedIn}
                        onChange={(e) => updateField('linkedIn', e.target.value)}
                        placeholder="https://linkedin.com/in/username"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Additional Info */}
            {currentStep === 'additional' && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Additional Information</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Optional - can be updated later</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Contact Type */}
                  <div className="space-y-1.5">
                    <label htmlFor="contactType" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Contact Type
                    </label>
                    <div className="relative">
                      <select
                        id="contactType"
                        value={formData.contactType}
                        onChange={(e) => {
                          updateField('contactType', e.target.value);
                          // Clear contactTypeOther when switching away from 'other'
                          if (e.target.value !== 'other') {
                            updateField('contactTypeOther', '');
                          }
                        }}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                      >
                        {contactTypeOptions.map((option) => (
                          <option key={option.value} value={option.value} disabled={option.value === ''}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="space-y-1.5">
                    <label htmlFor="status" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Status
                    </label>
                    <div className="relative">
                      <select
                        id="status"
                        value={formData.status}
                        onChange={(e) => updateField('status', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                        </svg>
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {statusOptions.find(o => o.value === formData.status)?.description}
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="space-y-1.5">
                    <label htmlFor="tags" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Tags
                    </label>
                    <input
                      type="text"
                      id="tags"
                      value={formData.tags}
                      onChange={(e) => updateField('tags', e.target.value)}
                      placeholder="e.g. VIP, Decision Maker, Technical"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                    />
                    <p className="text-xs text-slate-400">Separate multiple tags with commas</p>
                  </div>

                  {/* Other Contact Type Specification */}
                  {formData.contactType === 'other' && (
                    <div className="space-y-1.5 md:col-span-2">
                      <label htmlFor="contactTypeOther" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Please specify the contact type <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="contactTypeOther"
                        value={formData.contactTypeOther}
                        onChange={(e) => updateField('contactTypeOther', e.target.value)}
                        placeholder="e.g. Consultant, Advisor, Media contact..."
                        className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                          errors.contactTypeOther ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'
                        }`}
                      />
                      {errors.contactTypeOther && <p className="text-xs text-red-500">{errors.contactTypeOther}</p>}
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label htmlFor="notes" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => updateField('notes', e.target.value)}
                      placeholder="Add any additional notes about this contact..."
                      rows={4}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700 mt-2">
              <button
                type="button"
                onClick={currentStepIndex === 0 ? handleCancel : handlePrevStep}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {currentStepIndex === 0 ? 'Cancel' : 'Previous'}
              </button>

              {currentStepIndex < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex items-center gap-2 bg-[#137fec] hover:bg-[#0e6ac7] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm shadow-[#137fec]/30 transition-all active:scale-95"
                >
                  <span>Next Step</span>
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-[#137fec] hover:bg-[#0e6ac7] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm shadow-[#137fec]/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Contact</span>
                      <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </Card>

        {/* Pro Tip */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100">Pro Tip</h4>
            <p className="text-sm text-blue-800 dark:text-blue-300/80">
              You can skip the &apos;Additional Info&apos; step if you don&apos;t have all details handy. You can always enrich the contact profile later from the contact detail view or through data enrichment integrations.
            </p>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <Toast open={toast.open} onOpenChange={(open) => setToast({ ...toast, open })} variant={toast.variant}>
        <div className="grid gap-1">
          <ToastTitle>{toast.title}</ToastTitle>
          <ToastDescription>{toast.description}</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}
