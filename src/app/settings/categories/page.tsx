'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface CategoryItem {
  id: string;
  name: string;
  is_seeded: boolean;
  expense_count: number;
}

export default function CategoriesManagementPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Rename modal
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [selectedCat, setSelectedCat] = useState<CategoryItem | null>(null);
  const [newName, setNewName] = useState('');

  // Merge modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [sourceCat, setSourceCat] = useState<CategoryItem | null>(null);
  const [targetCatName, setTargetCatName] = useState('');

  // Add category modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadCategories(true);
  }, []);

  async function loadCategories(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    const { data: cats } = await supabase
      .from('expense_categories')
      .select('*')
      .order('name', { ascending: true });

    const { data: expenses } = await supabase
      .from('expenses')
      .select('category')
      .is('deleted_at', null);

    const countMap: Record<string, number> = {};
    (expenses || []).forEach(e => {
      countMap[e.category] = (countMap[e.category] || 0) + 1;
    });

    const enriched: CategoryItem[] = (cats || []).map(c => ({
      ...c,
      expense_count: countMap[c.name] || 0,
    }));

    setCategories(enriched);
    setLoading(false);
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSaving(true);

    await supabase.from('expense_categories').insert({
      name: newCatName.trim(),
      is_seeded: false,
    });

    setNewCatName('');
    setShowAddModal(false);
    setSaving(false);
    loadCategories();
  }

  async function handleRenameCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCat || !newName.trim()) return;
    setSaving(true);
    const updatedId = selectedCat.id;

    // 1. Update expenses pointing to old name
    await supabase
      .from('expenses')
      .update({ category: newName.trim() })
      .eq('category', selectedCat.name);

    // 2. Update category record
    await supabase
      .from('expense_categories')
      .update({ name: newName.trim() })
      .eq('id', selectedCat.id);

    setShowRenameModal(false);
    setSelectedCat(null);
    setNewName('');
    setSaving(false);
    await loadCategories(false);
    setTimeout(() => {
      const el = document.getElementById(`row-${updatedId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('row-highlight');
        setTimeout(() => el.classList.remove('row-highlight'), 2500);
      }
    }, 50);
  }

  async function handleMergeCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceCat || !targetCatName) return;
    setSaving(true);
    const prevScrollY = window.scrollY;

    // 1. Rewrite expenses to target category name (PRD §8)
    await supabase
      .from('expenses')
      .update({ category: targetCatName })
      .eq('category', sourceCat.name);

    // 2. Delete source category
    await supabase
      .from('expense_categories')
      .delete()
      .eq('id', sourceCat.id);

    setShowMergeModal(false);
    setSourceCat(null);
    setTargetCatName('');
    setSaving(false);
    await loadCategories(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
        <Link href="/settings" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>
          ← Back to Settings
        </Link>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">🏷️ Category Management</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Rename, merge and organise construction expense categories
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          ➕ Add Category
        </button>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading categories...</span>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                  <th>Category Name</th>
                  <th>Source</th>
                  <th>Usage Count</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, idx) => (
                  <tr key={cat.id} id={`row-${cat.id}`}>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{idx + 1}</td>
                    <td style={{ fontWeight: 600, color: 'var(--color-navy)' }}>
                      {cat.name}
                    </td>
                    <td>
                      <span className={`badge ${cat.is_seeded ? 'badge-neutral' : 'badge-info'}`}>
                        {cat.is_seeded ? 'Default Seed' : 'Custom'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                        {cat.expense_count} {cat.expense_count === 1 ? 'Expense' : 'Expenses'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-xs">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSelectedCat(cat);
                            setNewName(cat.name);
                            setShowRenameModal(true);
                          }}
                        >
                          ✏️ Rename
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setSourceCat(cat);
                            setShowMergeModal(true);
                          }}
                        >
                          🔀 Merge
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD CATEGORY */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">➕ Add Construction Category</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddCategory}>
              <div className="form-group">
                <label className="form-label" htmlFor="new-cat-input">Category Name <span className="required">*</span></label>
                <input
                  id="new-cat-input"
                  type="text"
                  className="input"
                  placeholder="e.g. False Ceiling / Gypsum"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Adding...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RENAME CATEGORY */}
      {showRenameModal && selectedCat && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">✏️ Rename Category</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRenameModal(false)}>✕</button>
            </div>
            <form onSubmit={handleRenameCategory}>
              <div className="form-group">
                <label className="form-label" htmlFor="ren-cat-input">New Category Name <span className="required">*</span></label>
                <input
                  id="ren-cat-input"
                  type="text"
                  className="input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
                <span className="form-helper">
                  All {selectedCat.expense_count} expenses using &ldquo;{selectedCat.name}&rdquo; will be updated automatically.
                </span>
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRenameModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Updating...' : 'Rename Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MERGE CATEGORY */}
      {showMergeModal && sourceCat && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">🔀 Merge Category &ldquo;{sourceCat.name}&rdquo;</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMergeModal(false)}>✕</button>
            </div>
            <form onSubmit={handleMergeCategory}>
              <div className="alert-banner alert-banner--warning">
                <span>⚠️</span>
                <span style={{ fontSize: '0.8125rem' }}>
                  All {sourceCat.expense_count} expenses under &ldquo;{sourceCat.name}&rdquo; will be rewritten to the destination category, and &ldquo;{sourceCat.name}&rdquo; will be removed.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="merge-dest-select">Merge into Destination Category <span className="required">*</span></label>
                <select
                  id="merge-dest-select"
                  className="select"
                  value={targetCatName}
                  onChange={(e) => setTargetCatName(e.target.value)}
                  required
                >
                  <option value="">Select destination...</option>
                  {categories.filter(c => c.id !== sourceCat.id).map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMergeModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !targetCatName}>
                  {saving ? 'Merging...' : 'Confirm & Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
