import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, Plus, Pencil, Trash2, ImagePlus, RefreshCw } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Button, StatusBadge, Spinner, Input, Label, Select } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import FoodMenuMatrix from "./FoodMenuMatrix";

const MEAL_CATEGORIES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

const EMPTY_ITEM = {
  name: "",
  description: "",
  price: "",
  category: "lunch",
  diet: "veg",
  menu_date: "",
  active: true,
  image: null,
};

function formatMenuDate(isoDate) {
  if (!isoDate) return "";
  try {
    const [y, m, d] = String(isoDate).split("-").map(Number);
    if (!y || !m || !d) return isoDate;
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function mediaUrl(path) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/${path}`;
}

export default function FoodMenuAdmin() {
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [togglingPage, setTogglingPage] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [pageEnabled, setPageEnabled] = useState(false);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [editingId, setEditingId] = useState(null);
  const itemImageRef = useRef(null);

  const loadMenuItems = useCallback(() => {
    setMenuLoading(true);
    api.get("/admin/food-menu-items")
      .then((r) => setMenuItems(r.data.items || []))
      .catch(() => toast.error("Could not load menu items"))
      .finally(() => setMenuLoading(false));
  }, []);

  const loadPageStatus = useCallback(() => {
    api.get("/admin/food-subscriptions/prices")
      .then((r) => setPageEnabled(!!r.data.page_enabled))
      .catch(() => {
        api.get("/admin/food-subscriptions")
          .then((r) => {
            if (typeof r.data.page_enabled === "boolean") setPageEnabled(r.data.page_enabled);
          })
          .catch(() => {});
      });
  }, []);

  useEffect(loadMenuItems, [loadMenuItems]);
  useEffect(loadPageStatus, [loadPageStatus]);

  const resetItemForm = () => {
    setItemForm(EMPTY_ITEM);
    setEditingId(null);
    if (itemImageRef.current) itemImageRef.current.value = "";
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setItemForm({
      name: item.name || "",
      description: item.description || "",
      price: String(Math.round((Number(item.amount_paise) || 0) / 100)),
      category: item.category || "lunch",
      diet: item.diet || "veg",
      menu_date: item.menu_date || "",
      active: item.active !== false,
      image: null,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveMenuItem = async (e) => {
    e.preventDefault();
    if (!itemForm.name.trim() || itemForm.name.trim().length < 2) {
      toast.error("Enter an item name / menu title");
      return;
    }
    if (!itemForm.menu_date) {
      toast.error("Select the menu date");
      return;
    }
    if (!["breakfast", "lunch", "dinner"].includes(itemForm.category)) {
      toast.error("Select Breakfast, Lunch, or Dinner");
      return;
    }
    if (!["veg", "non_veg"].includes(itemForm.diet)) {
      toast.error("Select Veg or Non-veg");
      return;
    }
    const price = Number(itemForm.price);
    if (Number.isNaN(price) || price < 0) {
      toast.error("Enter a valid price in rupees");
      return;
    }
    setSavingItem(true);
    try {
      const fd = new FormData();
      fd.append("name", itemForm.name.trim());
      fd.append("description", itemForm.description.trim());
      fd.append("menu", itemForm.description.trim());
      fd.append("category", itemForm.category);
      fd.append("diet", itemForm.diet);
      fd.append("menu_date", itemForm.menu_date);
      fd.append("price_rupees", String(price));
      fd.append("active", itemForm.active ? "true" : "false");
      if (itemForm.image) fd.append("image", itemForm.image);
      if (editingId) {
        await api.put(`/admin/food-menu-items/${editingId}`, fd);
        toast.success("Menu item updated");
      } else {
        await api.post("/admin/food-menu-items", fd);
        toast.success("Menu item created");
      }
      resetItemForm();
      loadMenuItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save menu item");
    } finally {
      setSavingItem(false);
    }
  };

  const deleteMenuItem = async (item) => {
    if (!window.confirm(`Remove “${item.name}” from the menu?`)) return;
    try {
      await api.delete(`/admin/food-menu-items/${item.id}`);
      toast.success("Item removed");
      if (editingId === item.id) resetItemForm();
      loadMenuItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not delete item");
    }
  };

  const setFoodPageEnabled = async (enabled) => {
    setTogglingPage(true);
    try {
      const r = await api.put("/admin/food-subscriptions/page", { page_enabled: enabled });
      setPageEnabled(!!r.data.page_enabled);
      toast.success(enabled ? "Food page is open for residents" : "Food page set to Coming soon");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update Food page status");
    } finally {
      setTogglingPage(false);
    }
  };

  return (
    <div data-testid="food-menu-admin-page" className="space-y-4">
      <div>
        <h1 className="mb-1 font-display text-4xl">Food Menu</h1>
        <p className="text-sm text-brown-800/50">
          Public page status, Pujo menu matrix, overall menu file and individual menu items.
        </p>
      </div>

      <Card data-testid="food-page-status-card">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-display text-xl text-brown-900">Public Food page</div>
            <p className="mt-1 text-sm text-brown-800/60">
              When set to Coming soon, residents see a placeholder instead of the menu cart.
            </p>
            <div className="mt-2">
              <StatusBadge status={pageEnabled ? "open" : "coming_soon"} />
            </div>
          </div>
          <div>
            {pageEnabled ? (
              <Button
                variant="subtle"
                size="sm"
                disabled={togglingPage}
                onClick={() => setFoodPageEnabled(false)}
                data-testid="food-page-coming-soon-btn"
              >
                <Ban className="h-4 w-4" /> {togglingPage ? "Updating…" : "Set coming soon"}
              </Button>
            ) : (
              <Button
                variant="admin"
                size="sm"
                disabled={togglingPage}
                onClick={() => setFoodPageEnabled(true)}
                data-testid="food-page-open-btn"
              >
                <CheckCircle2 className="h-4 w-4" /> {togglingPage ? "Updating…" : "Open Food page"}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <FoodMenuMatrix />

      <Card data-testid="food-menu-items-card">
        <CardBody>
          <div className="mb-1 font-display text-xl text-brown-900">
            {editingId ? "Edit menu item" : "New menu item"}
          </div>
          <p className="mb-4 text-sm text-brown-800/60">
            Date, meal category, veg/non-veg, menu image and price. Active items appear on the public Food page.
          </p>
          <form onSubmit={saveMenuItem} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label required>Item / menu name</Label>
              <Input
                data-testid="food-item-name"
                value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Veg thali · Khichuri special"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Menu / description</Label>
              <Input
                data-testid="food-item-description"
                value={itemForm.description}
                onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What’s included — rice, dal, sabzi…"
              />
            </div>
            <div>
              <Label required>Date</Label>
              <Input
                data-testid="food-item-date"
                type="date"
                value={itemForm.menu_date}
                onChange={(e) => setItemForm((f) => ({ ...f, menu_date: e.target.value }))}
              />
            </div>
            <div>
              <Label required>Category</Label>
              <Select
                data-testid="food-item-category"
                value={itemForm.category}
                onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))}
              >
                {MEAL_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label required>Veg / Non-veg</Label>
              <div className="mt-2 flex flex-wrap gap-4" data-testid="food-item-diet">
                {[
                  ["veg", "Veg"],
                  ["non_veg", "Non-veg"],
                ].map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-2 text-sm text-brown-900">
                    <input
                      type="radio"
                      name="food-item-diet"
                      value={value}
                      checked={itemForm.diet === value}
                      onChange={() => setItemForm((f) => ({ ...f, diet: value }))}
                      className="h-4 w-4 accent-vermilion-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label required>Price (₹)</Label>
              <Input
                data-testid="food-item-price"
                type="number"
                min={0}
                step="1"
                value={itemForm.price}
                onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="250"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Menu image</Label>
              <label
                htmlFor="food-item-image"
                className="mt-1 flex min-h-[5.5rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brown-800/25 bg-sun-50/50 px-4 py-4 text-center hover:border-vermilion-500/40"
              >
                <ImagePlus className="h-5 w-5 text-vermilion-500" />
                <span className="mt-1 text-sm font-medium text-brown-900">
                  {itemForm.image?.name || (editingId ? "Replace image (optional)" : "Upload PNG / JPG")}
                </span>
                <input
                  id="food-item-image"
                  ref={itemImageRef}
                  data-testid="food-item-image"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setItemForm((f) => ({ ...f, image: e.target.files?.[0] || null }))}
                />
              </label>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-brown-800/80">
                <input
                  type="checkbox"
                  checked={!!itemForm.active}
                  onChange={(e) => setItemForm((f) => ({ ...f, active: e.target.checked }))}
                  className="h-4 w-4"
                />
                Active on public menu
              </label>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" variant="admin" size="sm" disabled={savingItem} data-testid="food-item-save-btn">
                {savingItem ? "Saving…" : editingId ? <><Pencil className="h-4 w-4" /> Update item</> : <><Plus className="h-4 w-4" /> Create item</>}
              </Button>
              {editingId && (
                <Button type="button" variant="subtle" size="sm" onClick={resetItemForm}>
                  Cancel edit
                </Button>
              )}
            </div>
          </form>

          <div className="mt-6 border-t border-sun-400/25 pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="font-display text-lg text-brown-900">Published items ({menuItems.length})</div>
              <Button variant="subtle" size="sm" onClick={loadMenuItems}><RefreshCw className="h-4 w-4" /></Button>
            </div>
            {menuLoading ? (
              <Spinner className="text-vermilion-500" />
            ) : menuItems.length === 0 ? (
              <p className="text-sm text-brown-800/50">No menu items yet. Create the first one above, or use the matrix.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {menuItems.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-xl border border-sun-400/30 bg-white" data-testid={`food-menu-row-${item.id}`}>
                    <div className="aspect-[16/10] bg-sun-50">
                      {item.image_url ? (
                        <img src={mediaUrl(item.image_url)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center px-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-800/80">Image not uploaded</div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-vermilion-500">
                            {item.menu_date && <span>{formatMenuDate(item.menu_date)}</span>}
                            {(item.category_label || item.category) && (
                              <span>· {item.category_label || item.category}</span>
                            )}
                            {item.diet_label && <span>· {item.diet_label}</span>}
                          </div>
                          <div className="mt-0.5 font-semibold text-brown-900">{item.name}</div>
                          {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-brown-800/60">{item.description}</p>}
                        </div>
                        <div className="shrink-0 font-semibold text-vermilion-600">{formatPaise(item.amount_paise)}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <StatusBadge status={item.active ? "open" : "coming_soon"} />
                        <div className="flex gap-1">
                          <Button type="button" variant="subtle" size="sm" onClick={() => startEdit(item)} aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="subtle" size="sm" onClick={() => deleteMenuItem(item)} aria-label="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
