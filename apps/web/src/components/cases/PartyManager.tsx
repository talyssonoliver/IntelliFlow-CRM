'use client';

/**
 * PartyManager Component (PG-138)
 *
 * Manages case parties (client, opposing counsel, witnesses, etc.).
 * Parties stored as JSON in case metadata.
 */

import { useState } from 'react';
import { cn } from '@intelliflow/ui';
import type { PartyData, PartyRole } from './types';
import { PARTY_ROLES } from './types';

interface PartyManagerProps {
  parties: PartyData[];
  onUpdate: (parties: PartyData[]) => void;
  disabled?: boolean;
}

export function PartyManager({ parties, onUpdate, disabled }: PartyManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<PartyRole>('CLIENT');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setName('');
    setRole('CLIENT');
    setOrganization('');
    setEmail('');
    setPhone('');
    setNotes('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const partyData: PartyData = {
      id: editingId || crypto.randomUUID(),
      name: name.trim(),
      role,
      organization: organization.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    if (editingId) {
      onUpdate(parties.map((p) => (p.id === editingId ? partyData : p)));
    } else {
      onUpdate([...parties, partyData]);
    }

    resetForm();
  };

  const handleEdit = (party: PartyData) => {
    setName(party.name);
    setRole(party.role);
    setOrganization(party.organization || '');
    setEmail(party.email || '');
    setPhone(party.phone || '');
    setNotes(party.notes || '');
    setEditingId(party.id);
    setShowForm(true);
  };

  const handleRemove = (partyId: string) => {
    onUpdate(parties.filter((p) => p.id !== partyId));
  };

  const getRoleBadgeColor = (r: PartyRole) => {
    switch (r) {
      case 'CLIENT': return 'bg-blue-100 text-blue-700';
      case 'OPPOSING_COUNSEL': return 'bg-red-100 text-red-700';
      case 'WITNESS': return 'bg-amber-100 text-amber-700';
      case 'EXPERT': return 'bg-purple-100 text-purple-700';
      case 'JUDGE': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div>
      {parties.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No parties</p>
      ) : (
        <ul className="space-y-3 mb-4">
          {parties.map((party) => (
            <li key={party.id} className="flex items-start gap-3 p-3 border rounded-md">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{party.name}</span>
                  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', getRoleBadgeColor(party.role))}>
                    {PARTY_ROLES.find((r) => r.value === party.role)?.label || party.role}
                  </span>
                </div>
                {party.organization && <p className="text-xs text-muted-foreground">{party.organization}</p>}
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  {party.email && <span>{party.email}</span>}
                  {party.phone && <span>{party.phone}</span>}
                </div>
                {party.notes && <p className="text-xs text-muted-foreground mt-1 italic">{party.notes}</p>}
              </div>
              {!disabled && (
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(party)} className="text-xs text-primary hover:underline" aria-label={`Edit ${party.name}`}>Edit</button>
                  <button onClick={() => handleRemove(party.id)} className="text-xs text-red-600 hover:underline" aria-label={`Remove ${party.name}`}>Remove</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        showForm ? (
          <form onSubmit={handleSubmit} className="space-y-2 p-3 border rounded-md">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" className="w-full px-3 py-1.5 text-sm border rounded-md bg-background" autoFocus required aria-label="Party name" />
            <select value={role} onChange={(e) => setRole(e.target.value as PartyRole)} className="w-full px-3 py-1.5 text-sm border rounded-md bg-background" aria-label="Party role">
              {PARTY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Organization" className="w-full px-3 py-1.5 text-sm border rounded-md bg-background" aria-label="Organization" />
            <div className="grid grid-cols-2 gap-2">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="px-3 py-1.5 text-sm border rounded-md bg-background" aria-label="Email" />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="px-3 py-1.5 text-sm border rounded-md bg-background" aria-label="Phone" />
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} className="w-full px-3 py-1.5 text-sm border rounded-md bg-background" aria-label="Notes" />
            <div className="flex gap-2">
              <button type="submit" className="px-3 py-1 text-sm font-medium text-white bg-primary rounded-md">
                {editingId ? 'Update Party' : 'Add Party'}
              </button>
              <button type="button" onClick={resetForm} className="px-3 py-1 text-sm border rounded-md">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowForm(true)} className="w-full px-4 py-2 text-sm border-2 border-dashed rounded-md text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
            + Add Party
          </button>
        )
      )}
    </div>
  );
}
