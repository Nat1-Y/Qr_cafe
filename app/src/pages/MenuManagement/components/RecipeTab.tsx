import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { LocalRecipe, LocalRecipeIngredient } from '@/db/types';

interface RecipeTabProps {
  menuItemId: string;
  menuItemName: string;
  existingRecipe: LocalRecipe | null;
  inventoryItems: any[];
  stockLocations: any[];
  onSave: (payload: {
    name: string;
    yield_quantity: number;
    deduct_strategy: string;
    deduct_from_location_id?: number | null;
    is_active: boolean;
    ingredients: Partial<LocalRecipeIngredient>[];
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}

interface IngredientRow {
  key: string;
  inventory_item_id: string;
  quantity: string;
  waste_factor: string;
  is_optional: boolean;
  notes: string;
}

const STRATEGIES = [
  { value: 'by_menu_category', label: 'From the section that makes it (auto)' },
  { value: 'fixed_location', label: 'Always from one stock place' },
  { value: 'default_location', label: 'From the main stock place' },
];

let keyCounter = 0;
const newKey = () => `ing-${++keyCounter}`;

export const RecipeTab: React.FC<RecipeTabProps> = ({
  menuItemId,
  menuItemName,
  existingRecipe,
  inventoryItems,
  stockLocations,
  onSave,
  onDelete,
}) => {
  const [recipeName, setRecipeName] = useState('');
  const [yieldQty, setYieldQty] = useState('1');
  const [strategy, setStrategy] = useState('by_menu_category');
  const [fixedLocationId, setFixedLocationId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Hydrate from existing recipe
  useEffect(() => {
    if (existingRecipe) {
      setRecipeName(existingRecipe.name || menuItemName);
      setYieldQty(String(existingRecipe.yield_quantity ?? 1));
      setStrategy(existingRecipe.deduct_strategy ?? 'by_menu_category');
      setFixedLocationId(existingRecipe.deduct_from_location_id ? String(existingRecipe.deduct_from_location_id) : '');
      setIsActive(existingRecipe.is_active !== false);
      setIngredients(
        (existingRecipe.ingredients ?? []).map((ing) => ({
          key: newKey(),
          inventory_item_id: ing.inventory_item_id ?? '',
          quantity: String(ing.quantity ?? ''),
          waste_factor: String(ing.waste_factor ?? '1.000'),
          is_optional: Boolean(ing.is_optional),
          notes: ing.notes ?? '',
        }))
      );
    } else {
      setRecipeName(menuItemName);
      setYieldQty('1');
      setStrategy('by_menu_category');
      setFixedLocationId('');
      setIsActive(true);
      setIngredients([]);
    }
  }, [existingRecipe, menuItemName]);

  const addIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { key: newKey(), inventory_item_id: '', quantity: '', waste_factor: '1.000', is_optional: false, notes: '' },
    ]);
  };

  const removeIngredient = (key: string) => {
    setIngredients((prev) => prev.filter((i) => i.key !== key));
  };

  const updateIngredient = (key: string, field: keyof IngredientRow, value: any) => {
    setIngredients((prev) =>
      prev.map((i) => (i.key === key ? { ...i, [field]: value } : i))
    );
  };

  const filteredInventory = inventoryItems.filter((item) =>
    !searchQuery || item.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validIngredients = ingredients.filter(
      (i) => i.inventory_item_id !== '' && Number(i.quantity) > 0
    );
    setSaving(true);
    try {
      await onSave({
        name: recipeName || menuItemName,
        yield_quantity: Math.max(1, parseInt(yieldQty, 10) || 1),
        deduct_strategy: strategy,
        deduct_from_location_id: strategy === 'fixed_location' && fixedLocationId ? Number(fixedLocationId) : null,
        is_active: isActive,
        ingredients: validIngredients.map((i, idx) => ({
          inventory_item_id: i.inventory_item_id,
          quantity: Math.round(parseFloat(i.quantity) * 1000) / 1000,
          waste_factor: i.waste_factor || '1.000',
          is_optional: i.is_optional,
          notes: i.notes || null,
          display_order: idx,
        })),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header status */}
      {existingRecipe ? (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="text-success font-medium">Recipe set</span>
          <span className="ml-auto text-xs text-muted-foreground">{existingRecipe.ingredients?.length ?? 0} ingredient(s)</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-warning" />
          <span className="text-warning font-medium">No recipe yet, so stock is not used up by orders</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {/* Recipe metadata */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Recipe name</Label>
            <Input
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              placeholder={menuItemName}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Yield (servings)</Label>
            <Input
              type="number"
              min="1"
              value={yieldQty}
              onChange={(e) => setYieldQty(e.target.value)}
              className="h-8"
            />
          </div>
        </div>

        {/* Deduction strategy */}
        <div className="space-y-1.5">
          <Label>Use stock from</Label>
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Fixed location picker */}
        {strategy === 'fixed_location' && (
          <div className="space-y-1.5">
            <Label>Stock place</Label>
            <Select value={fixedLocationId} onValueChange={setFixedLocationId}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Pick a stock place" />
              </SelectTrigger>
              <SelectContent>
                {stockLocations.map((loc: any) => (
                  <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Active toggle */}
        <div className="flex items-center gap-2">
          <input
            id="recipe-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded"
          />
          <Label htmlFor="recipe-active" className="cursor-pointer">On (use stock when sold)</Label>
        </div>

        {/* Ingredients list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Ingredients</Label>
            <Button type="button" variant="outline" size="sm" onClick={addIngredient} className="h-7 px-2">
              + Add
            </Button>
          </div>

          {ingredients.length === 0 && (
            <p className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
              No ingredients yet. Tap "+ Add" to start.
            </p>
          )}

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {ingredients.map((ing, idx) => (
              <div key={ing.key} className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeIngredient(ing.key)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label>Stock item</Label>
                    <Select
                      value={ing.inventory_item_id !== '' ? String(ing.inventory_item_id) : ''}
                      onValueChange={(v) => updateIngredient(ing.key, 'inventory_item_id', Number(v))}
                    >
                      <SelectTrigger className="h-7">
                        <SelectValue placeholder="Pick an item" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-1">
                          <Input
                            placeholder="Search…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-6 mb-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {filteredInventory.map((item: any) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.name} ({item.base_unit ?? item.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Amount (small unit)</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 250"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(ing.key, 'quantity', e.target.value)}
                      className="h-7"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Extra for waste</Label>
                    <Input
                      type="number"
                      min="1"
                      step="0.001"
                      placeholder="1.000"
                      value={ing.waste_factor}
                      onChange={(e) => updateIngredient(ing.key, 'waste_factor', e.target.value)}
                      className="h-7"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`opt-${ing.key}`}
                    checked={ing.is_optional}
                    onChange={(e) => updateIngredient(ing.key, 'is_optional', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor={`opt-${ing.key}`} className="cursor-pointer">Optional</Label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Saving…' : existingRecipe ? 'Save recipe' : 'Add recipe'}
          </Button>
          {existingRecipe && (
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
              disabled={saving}
              className="px-3"
            >
              Delete
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};

export default RecipeTab;
