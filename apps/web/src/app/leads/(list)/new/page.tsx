'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@intelliflow/ui';

// Step configuration
type StepId = 'basic' | 'company' | 'qualification';

interface Step {
  id: StepId;
  number: number;
  label: string;
}

const steps: Step[] = [
  { id: 'basic', number: 1, label: 'Basic Info' },
  { id: 'company', number: 2, label: 'Company Details' },
  { id: 'qualification', number: 3, label: 'Qualification' },
];

// Form data structure
interface LeadFormData {
  // Step 1: Basic Info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  source: string;
  sourceOther: string;
  // Step 2: Company Details
  company: string;
  website: string;
  industry: string;
  companySize: string;
  annualRevenue: string;
  // Step 3: Qualification
  status: string;
  qualificationNotes: string;
  budget: string;
  authority: string;
  need: string;
  timeline: string;
}

const initialFormData: LeadFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  jobTitle: '',
  source: '',
  sourceOther: '',
  company: '',
  website: '',
  industry: '',
  companySize: '',
  annualRevenue: '',
  status: 'NEW',
  qualificationNotes: '',
  budget: '',
  authority: '',
  need: '',
  timeline: '',
};

// Lead source options
const sourceOptions = [
  { value: '', label: 'Select a source...' },
  { value: 'website', label: 'Website / Organic' },
  { value: 'referral', label: 'Referral' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'conference', label: 'Conference / Event' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'other', label: 'Other' },
];

// Industry options
const industryOptions = [
  { value: '', label: 'Select an industry...' },
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance & Banking' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'retail', label: 'Retail & E-commerce' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
];

// Company size options
const companySizeOptions = [
  { value: '', label: 'Select company size...' },
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

// Revenue options
const revenueOptions = [
  { value: '', label: 'Select annual revenue...' },
  { value: '<1M', label: 'Less than $1M' },
  { value: '1M-10M', label: '$1M - $10M' },
  { value: '10M-50M', label: '$10M - $50M' },
  { value: '50M-100M', label: '$50M - $100M' },
  { value: '100M+', label: '$100M+' },
];

// Timeline options
const timelineOptions = [
  { value: '', label: 'Select timeline...' },
  { value: 'immediate', label: 'Immediate (within 1 month)' },
  { value: 'short', label: 'Short-term (1-3 months)' },
  { value: 'medium', label: 'Medium-term (3-6 months)' },
  { value: 'long', label: 'Long-term (6+ months)' },
  { value: 'unknown', label: 'Unknown / Not discussed' },
];

export default function CreateNewLeadPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<StepId>('basic');
  const [formData, setFormData] = useState<LeadFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof LeadFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  // Update form field
  const updateField = (field: keyof LeadFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Validate current step
  const validateStep = (): boolean => {
    const newErrors: Partial<Record<keyof LeadFormData, string>> = {};

    if (currentStep === 'basic') {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
      if (!formData.email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
      }
      // Validate sourceOther when 'Other' is selected
      if (formData.source === 'other' && !formData.sourceOther.trim()) {
        newErrors.sourceOther = 'Please specify where the lead came from';
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
      // TODO: Call tRPC mutation to create lead
      console.log('Creating lead:', formData);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Redirect to leads list on success
      router.push('/leads');
    } catch (error) {
      console.error('Failed to create lead:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel and go back
  const handleCancel = () => {
    router.push('/leads');
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
              <Link href="/leads" className="text-slate-500 dark:text-slate-400 hover:text-[#137fec] text-sm font-medium transition-colors">
                Leads
              </Link>
            </li>
            <li><span className="text-slate-300 dark:text-slate-600">/</span></li>
            <li>
              <span className="text-slate-900 dark:text-white text-sm font-medium">New Lead</span>
            </li>
          </ol>
        </nav>

        {/* Page Title */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Create New Lead</h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">Capture information about a potential opportunity.</p>
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
            {/* Step 1: Basic Info */}
            {currentStep === 'basic' && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Lead Information</h3>
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

                  {/* Lead Source */}
                  <div className="space-y-1.5">
                    <label htmlFor="source" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Lead Source
                    </label>
                    <div className="relative">
                      <select
                        id="source"
                        value={formData.source}
                        onChange={(e) => {
                          updateField('source', e.target.value);
                          // Clear sourceOther when switching away from 'other'
                          if (e.target.value !== 'other') {
                            updateField('sourceOther', '');
                          }
                        }}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                      >
                        {sourceOptions.map((option) => (
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

                  {/* Other Source Specification - shown when 'Other' is selected */}
                  {formData.source === 'other' && (
                    <div className="space-y-1.5 md:col-span-2">
                      <label htmlFor="sourceOther" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Please specify where the lead came from <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="sourceOther"
                        value={formData.sourceOther}
                        onChange={(e) => updateField('sourceOther', e.target.value)}
                        placeholder="e.g. Industry newsletter, Partner referral, Podcast ad..."
                        className={`w-full rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow ${
                          errors.sourceOther ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'
                        }`}
                      />
                      {errors.sourceOther && <p className="text-xs text-red-500">{errors.sourceOther}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Company Details */}
            {currentStep === 'company' && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Company Information</h3>
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

                  {/* Website */}
                  <div className="space-y-1.5">
                    <label htmlFor="website" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Website
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                        </svg>
                      </span>
                      <input
                        type="url"
                        id="website"
                        value={formData.website}
                        onChange={(e) => updateField('website', e.target.value)}
                        placeholder="https://www.example.com"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                      />
                    </div>
                  </div>

                  {/* Industry */}
                  <div className="space-y-1.5">
                    <label htmlFor="industry" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Industry
                    </label>
                    <div className="relative">
                      <select
                        id="industry"
                        value={formData.industry}
                        onChange={(e) => updateField('industry', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                      >
                        {industryOptions.map((option) => (
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

                  {/* Company Size */}
                  <div className="space-y-1.5">
                    <label htmlFor="companySize" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Company Size
                    </label>
                    <div className="relative">
                      <select
                        id="companySize"
                        value={formData.companySize}
                        onChange={(e) => updateField('companySize', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                      >
                        {companySizeOptions.map((option) => (
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

                  {/* Annual Revenue */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label htmlFor="annualRevenue" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Annual Revenue
                    </label>
                    <div className="relative">
                      <select
                        id="annualRevenue"
                        value={formData.annualRevenue}
                        onChange={(e) => updateField('annualRevenue', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                      >
                        {revenueOptions.map((option) => (
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
                </div>
              </div>
            )}

            {/* Step 3: Qualification */}
            {currentStep === 'qualification' && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Qualification (BANT)</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Optional - can be updated later</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Budget */}
                  <div className="space-y-1.5">
                    <label htmlFor="budget" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Budget
                    </label>
                    <input
                      type="text"
                      id="budget"
                      value={formData.budget}
                      onChange={(e) => updateField('budget', e.target.value)}
                      placeholder="e.g. $50,000 - $100,000"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                    />
                  </div>

                  {/* Authority */}
                  <div className="space-y-1.5">
                    <label htmlFor="authority" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Authority
                    </label>
                    <input
                      type="text"
                      id="authority"
                      value={formData.authority}
                      onChange={(e) => updateField('authority', e.target.value)}
                      placeholder="e.g. Decision maker, Influencer"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                    />
                  </div>

                  {/* Need */}
                  <div className="space-y-1.5">
                    <label htmlFor="need" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Need
                    </label>
                    <input
                      type="text"
                      id="need"
                      value={formData.need}
                      onChange={(e) => updateField('need', e.target.value)}
                      placeholder="e.g. CRM solution, Sales automation"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] placeholder-slate-400 transition-shadow"
                    />
                  </div>

                  {/* Timeline */}
                  <div className="space-y-1.5">
                    <label htmlFor="timeline" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Timeline
                    </label>
                    <div className="relative">
                      <select
                        id="timeline"
                        value={formData.timeline}
                        onChange={(e) => updateField('timeline', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] appearance-none cursor-pointer transition-shadow"
                      >
                        {timelineOptions.map((option) => (
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

                  {/* Qualification Notes */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label htmlFor="qualificationNotes" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Qualification Notes
                    </label>
                    <textarea
                      id="qualificationNotes"
                      value={formData.qualificationNotes}
                      onChange={(e) => updateField('qualificationNotes', e.target.value)}
                      placeholder="Add any additional notes about lead qualification..."
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
                      <span>Create Lead</span>
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
            You can skip the &apos;Qualification&apos; step for now if you haven&apos;t spoken to the lead yet. You can always update the qualification status later from the lead detail view.
          </p>
        </div>
      </div>
    </div>
  );
}
