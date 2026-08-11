import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag, Plus, Edit, Trash2, ExternalLink, Search,
  Star, TrendingUp, Eye, Package, Tag, Heart, Sparkles, BadgeCheck,
  ChevronRight, ArrowLeft, X, Check, Loader2, Grid3x3, LayoutList
} from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { TopBar } from '@/components/layout/TopBar';

type ViewMode = 'marketplace' | 'my-products' | 'add-product' | 'edit-product';
type GridMode = 'grid' | 'list';

const CATEGORIES = ['All', 'Fashion', 'Tech', 'Art', 'Music', 'Food', 'Books', 'Beauty', 'Fitness', 'Other'];

export function ProductsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('marketplace');
  const [gridMode, setGridMode] = useState<GridMode>('grid');
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [myProducts, setMyProducts] = useState<any[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formCategory, setFormCategory] = useState('Other');
  const [formStock, setFormStock] = useState('');
  const [saving, setSaving] = useState(false);

  // Wishlist (localStorage)
  const [wishlist, setWishlist] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('product_wishlist') || '[]')); }
    catch { return new Set(); }
  });

  const toggleWishlist = (id: string) => {
    setWishlist(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('product_wishlist', JSON.stringify([...next]));
      return next;
    });
  };

  useEffect(() => {
    fetchMarketplace();
    if (user) fetchMyProducts();
  }, [user]);

  const fetchMarketplace = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*, user_profiles(id, username, avatar_url, verified)')
      .eq('is_active', true)
      .order('views_count', { ascending: false })
      .limit(80);
    const products = data ?? [];
    setAllProducts(products);
    setFeaturedProducts(products.filter((p: any) => p.is_featured).slice(0, 5));
    setLoading(false);
  };

  const fetchMyProducts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setMyProducts(data ?? []);
  };

  const handleSaveProduct = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!formName.trim() || !formPrice) { toast.error('Name and price are required'); return; }
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: formName.trim(),
      description: formDesc.trim(),
      price: Number(formPrice),
      external_link: formLink.trim(),
      image_url: formImage.trim() || null,
      stock: formStock ? Number(formStock) : 0,
      is_active: true,
    };
    if (editingProduct) {
      const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
      if (error) { toast.error(error.message); }
      else { toast.success('Product updated'); resetForm(); setViewMode('my-products'); fetchMyProducts(); }
    } else {
      const { error } = await supabase.from('products').insert(payload);
      if (error) { toast.error(error.message); }
      else { toast.success('Product listed!'); resetForm(); setViewMode('my-products'); fetchMyProducts(); fetchMarketplace(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    await supabase.from('products').delete().eq('id', id);
    toast.success('Deleted');
    fetchMyProducts();
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    await supabase.from('products').update({ is_active: !current }).eq('id', id);
    fetchMyProducts();
  };

  const trackView = async (productId: string) => {
    await supabase.from('products').update({ views_count: supabase.rpc as any }).eq('id', productId).catch(() => {});
    await supabase.rpc('increment', { row_id: productId, table_name: 'products', column_name: 'views_count' }).catch(() => {});
  };

  const resetForm = () => {
    setFormName(''); setFormDesc(''); setFormPrice('');
    setFormLink(''); setFormImage(''); setFormCategory('Other');
    setFormStock(''); setEditingProduct(null);
  };

  const openEdit = (p: any) => {
    setEditingProduct(p);
    setFormName(p.name ?? '');
    setFormDesc(p.description ?? '');
    setFormPrice(String(p.price ?? ''));
    setFormLink(p.external_link ?? '');
    setFormImage(p.image_url ?? '');
    setFormCategory('Other');
    setFormStock(String(p.stock ?? ''));
    setViewMode('edit-product');
  };

  // Filter marketplace
  const filteredProducts = allProducts.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  // ── Render: Add/Edit Product Form ────────────────────────────────────────
  if (viewMode === 'add-product' || viewMode === 'edit-product') {
    return (
      <div className="max-w-2xl mx-auto pb-20">
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center gap-3 px-4 h-14">
            <button onClick={() => { resetForm(); setViewMode(editingProduct ? 'my-products' : 'marketplace'); }} className="p-2 hover:bg-muted rounded-full"><ArrowLeft className="w-5 h-5" /></button>
            <h1 className="text-xl font-bold">{editingProduct ? 'Edit Product' : 'List a Product'}</h1>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {/* Image preview */}
          {formImage && (
            <div className="relative w-full h-52 rounded-2xl overflow-hidden border border-border bg-muted">
              <img src={formImage} alt="preview" className="w-full h-full object-cover" />
              <button onClick={() => setFormImage('')} className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Product Name *</label>
              <input
                value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Handmade Bracelet"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 text-base"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Description</label>
              <textarea
                value={formDesc} onChange={e => setFormDesc(e.target.value)}
                rows={3} placeholder="Describe your product…"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 text-base resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Price (USD) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                  <input
                    type="number" min="0" step="0.01" value={formPrice}
                    onChange={e => setFormPrice(e.target.value)} placeholder="0.00"
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Stock</label>
                <input
                  type="number" min="0" value={formStock}
                  onChange={e => setFormStock(e.target.value)} placeholder="∞"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Image URL</label>
              <input
                value={formImage} onChange={e => setFormImage(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Buy Link (optional)</label>
              <input
                value={formLink} onChange={e => setFormLink(e.target.value)}
                placeholder="https://your-store.com/product"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <button
            onClick={handleSaveProduct}
            disabled={saving || !formName.trim() || !formPrice}
            className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {saving ? 'Saving…' : editingProduct ? 'Save Changes' : 'List Product'}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: My Products ──────────────────────────────────────────────────
  if (viewMode === 'my-products') {
    return (
      <div className="max-w-4xl mx-auto pb-20">
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center gap-3 px-4 h-14">
            <button onClick={() => setViewMode('marketplace')} className="p-2 hover:bg-muted rounded-full"><ArrowLeft className="w-5 h-5" /></button>
            <h1 className="text-xl font-bold">My Products</h1>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">{myProducts.length} product{myProducts.length !== 1 ? 's' : ''} listed</p>
            <button
              onClick={() => { resetForm(); setViewMode('add-product'); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>

          {myProducts.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Package className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">No products yet</h2>
              <p className="text-muted-foreground mb-5 text-sm">Create products to sell and tag them in your posts</p>
              <button
                onClick={() => { resetForm(); setViewMode('add-product'); }}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90"
              >
                List Your First Product
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myProducts.map(product => (
                <div key={product.id} className={`rounded-2xl border border-border bg-card overflow-hidden transition-opacity ${!product.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex gap-3 p-3">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-20 h-20 object-cover rounded-xl flex-shrink-0" />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-base leading-tight truncate">{product.name}</h3>
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${product.is_active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                          {product.is_active ? 'Live' : 'Hidden'}
                        </span>
                      </div>
                      <p className="text-xl font-black text-primary mt-0.5">${Number(product.price).toFixed(2)}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{product.views_count ?? 0}</span>
                        <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{product.sales_count ?? 0} sold</span>
                        {product.stock > 0 && <span className="flex items-center gap-1"><Package className="w-3 h-3" />{product.stock} left</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex border-t border-border divide-x divide-border">
                    <button onClick={() => openEdit(product)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                      <Edit className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => handleToggleActive(product.id, product.is_active)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                      {product.is_active ? 'Hide' : 'Show'}
                    </button>
                    {product.external_link && (
                      <a href={product.external_link} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors text-primary">
                        <ExternalLink className="w-3.5 h-3.5" /> View
                      </a>
                    )}
                    <button onClick={() => handleDelete(product.id)} className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/10 text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Marketplace ──────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto pb-20">
      <TopBar title="Marketplace" />

      {/* Hero search bar */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-muted/40 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
            />
          </div>
          <button
            onClick={() => setGridMode(g => g === 'grid' ? 'list' : 'grid')}
            className="p-2.5 border border-border rounded-xl hover:bg-muted transition-colors text-muted-foreground"
          >
            {gridMode === 'grid' ? <LayoutList className="w-4 h-4" /> : <Grid3x3 className="w-4 h-4" />}
          </button>
          {user && (
            <button
              onClick={() => setViewMode('my-products')}
              className="p-2.5 border border-border rounded-xl hover:bg-muted transition-colors text-muted-foreground relative"
            >
              <Package className="w-4 h-4" />
              {myProducts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                  {myProducts.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Featured Products Carousel */}
          {!search && featuredProducts.length > 0 && (
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="font-bold text-base">Featured</h2>
              </div>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                {featuredProducts.map(p => (
                  <a
                    key={p.id} href={p.external_link ?? '#'} target={p.external_link ? '_blank' : '_self'}
                    rel="noopener noreferrer"
                    onClick={() => trackView(p.id)}
                    className="shrink-0 w-48 rounded-2xl overflow-hidden border border-border bg-card hover:shadow-lg transition-shadow group"
                  >
                    <div className="w-full h-32 bg-muted relative overflow-hidden">
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-10 h-10 text-muted-foreground" /></div>
                      }
                      <div className="absolute top-2 left-2">
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400/90 text-yellow-900">
                          <Star className="w-2.5 h-2.5" /> Featured
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-sm truncate">{p.name}</p>
                      <p className="text-base font-black text-primary mt-0.5">${Number(p.price).toFixed(2)}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {p.user_profiles?.avatar_url
                          ? <img src={p.user_profiles.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                          : <div className="w-4 h-4 rounded-full bg-muted" />
                        }
                        <span className="text-[10px] text-muted-foreground truncate">{p.user_profiles?.username}</span>
                        {p.user_profiles?.verified && <BadgeCheck className="w-3 h-3 text-primary flex-shrink-0" />}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Stats bar */}
          {!search && (
            <div className="flex gap-4 px-4 py-3 border-y border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm font-semibold">{allProducts.length} products</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">From creators you follow</span>
              </div>
            </div>
          )}

          {/* Sell CTA for logged-in users */}
          {user && !search && (
            <div className="mx-4 mt-4 p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Tag className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Sell your products</p>
                <p className="text-xs text-muted-foreground">List items and tag them in posts</p>
              </div>
              <button
                onClick={() => { resetForm(); setViewMode('add-product'); }}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" /> Sell
              </button>
            </div>
          )}

          {/* Products Grid/List */}
          <div className="p-4">
            {search && (
              <p className="text-sm text-muted-foreground mb-3">
                {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''} for "{search}"
              </p>
            )}

            {filteredProducts.length === 0 ? (
              <div className="text-center py-16">
                <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                <h2 className="text-xl font-semibold mb-2">No products found</h2>
                <p className="text-muted-foreground text-sm">
                  {search ? `No results for "${search}"` : 'Be the first to list a product!'}
                </p>
                {search && (
                  <button onClick={() => setSearch('')} className="mt-3 text-primary hover:underline text-sm">Clear search</button>
                )}
              </div>
            ) : gridMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredProducts.map(product => (
                  <ProductCard
                    key={product.id} product={product}
                    wishlisted={wishlist.has(product.id)}
                    onWishlist={() => toggleWishlist(product.id)}
                    onView={() => trackView(product.id)}
                    onProfile={() => navigate(`/profile/${product.user_profiles?.username}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProducts.map(product => (
                  <ProductListItem
                    key={product.id} product={product}
                    wishlisted={wishlist.has(product.id)}
                    onWishlist={() => toggleWishlist(product.id)}
                    onView={() => trackView(product.id)}
                    onProfile={() => navigate(`/profile/${product.user_profiles?.username}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Product Card (Grid) ──────────────────────────────────────────────────────
function ProductCard({ product, wishlisted, onWishlist, onView, onProfile }: {
  product: any; wishlisted: boolean; onWishlist: () => void;
  onView: () => void; onProfile: () => void;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card hover:shadow-lg transition-all group">
      {/* Image */}
      <div className="relative w-full aspect-square bg-muted overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-10 h-10 text-muted-foreground" /></div>
        }
        <button
          onClick={e => { e.preventDefault(); onWishlist(); }}
          className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
            wishlisted ? 'bg-red-500 text-white' : 'bg-black/40 text-white hover:bg-red-500'
          }`}
        >
          <Heart className={`w-3.5 h-3.5 ${wishlisted ? 'fill-white' : ''}`} />
        </button>
        {product.stock === 0 && product.stock !== null && (
          <div className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/60 text-white">Sold out</div>
        )}
      </div>
      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-sm leading-tight line-clamp-2 mb-1">{product.name}</p>
        <p className="text-base font-black text-primary">${Number(product.price).toFixed(2)}</p>
        {/* Seller */}
        <button
          onClick={onProfile}
          className="flex items-center gap-1.5 mt-2 hover:opacity-80 transition-opacity"
        >
          {product.user_profiles?.avatar_url
            ? <img src={product.user_profiles.avatar_url} alt="" className="w-5 h-5 rounded-full" />
            : <div className="w-5 h-5 rounded-full bg-muted" />
          }
          <span className="text-[11px] text-muted-foreground truncate max-w-[90px]">{product.user_profiles?.username}</span>
          {product.user_profiles?.verified && <BadgeCheck className="w-3 h-3 text-primary flex-shrink-0" />}
        </button>
        {/* CTA */}
        {product.external_link ? (
          <a
            href={product.external_link} target="_blank" rel="noopener noreferrer"
            onClick={onView}
            className="mt-2.5 flex items-center justify-center gap-1.5 w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-colors"
          >
            Buy Now <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <div className="mt-2.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="w-3 h-3" />{product.views_count ?? 0} views
          </div>
        )}
      </div>
    </div>
  );
}

// ── Product List Item ────────────────────────────────────────────────────────
function ProductListItem({ product, wishlisted, onWishlist, onView, onProfile }: {
  product: any; wishlisted: boolean; onWishlist: () => void;
  onView: () => void; onProfile: () => void;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-2xl border border-border bg-card hover:shadow-md transition-shadow">
      <div className="w-20 h-20 rounded-xl bg-muted overflow-hidden flex-shrink-0">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-8 h-8 text-muted-foreground" /></div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-bold text-base leading-tight line-clamp-1">{product.name}</p>
          <button
            onClick={e => { e.preventDefault(); onWishlist(); }}
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all border ${
              wishlisted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'border-border text-muted-foreground hover:text-red-500'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${wishlisted ? 'fill-red-500' : ''}`} />
          </button>
        </div>
        {product.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{product.description}</p>}
        <p className="text-lg font-black text-primary mt-1">${Number(product.price).toFixed(2)}</p>
        <div className="flex items-center justify-between mt-1.5">
          <button onClick={onProfile} className="flex items-center gap-1.5 hover:opacity-80">
            {product.user_profiles?.avatar_url
              ? <img src={product.user_profiles.avatar_url} alt="" className="w-4 h-4 rounded-full" />
              : <div className="w-4 h-4 rounded-full bg-muted" />
            }
            <span className="text-[11px] text-muted-foreground">{product.user_profiles?.username}</span>
          </button>
          {product.external_link ? (
            <a
              href={product.external_link} target="_blank" rel="noopener noreferrer"
              onClick={onView}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-full hover:opacity-90 transition-opacity"
            >
              Buy <ChevronRight className="w-3 h-3" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Eye className="w-3 h-3" />{product.views_count ?? 0}</span>
          )}
        </div>
      </div>
    </div>
  );
}
