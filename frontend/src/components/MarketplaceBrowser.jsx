import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Shapes,
  Headphones,
  Shirt,
  Armchair,
  Bike,
  BookOpen,
  Package,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { categories, conditions } from '../lib/listings';
import { states } from './LocationFields';
import Input from './Input';
import Select from './Select';
import Button from './Button';
import ListingCard from './ListingCard';
import LoadingState from './LoadingState';
import EmptyState from './EmptyState';
const icons = [Shapes, Headphones, Shirt, Armchair, Bike, BookOpen, Package];
const tones = ['lavender', 'blue', 'pink', 'peach', 'mint', 'yellow', 'lavender'];
const defaults = {
  search: '',
  category: '',
  condition: '',
  state: '',
  city: '',
  minPrice: '',
  maxPrice: '',
  sort: 'newest',
};
export default function MarketplaceBrowser() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const [filters, setFilters] = useState(defaults);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setFilters(
      Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [key, params.get(key) || value]),
      ),
    );
  }, [query]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api('/listings?' + query)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, retry]);
  function change(e) {
    setFilters((current) => ({ ...current, [e.target.name]: e.target.value }));
  }
  function apply(values) {
    const next = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value) next.set(key, value);
    });
    setParams(next);
  }
  function submit(e) {
    e.preventDefault();
    if (
      filters.minPrice !== '' &&
      filters.maxPrice !== '' &&
      Number(filters.minPrice) > Number(filters.maxPrice)
    ) {
      setError('Minimum price cannot be greater than maximum price.');
      return;
    }
    apply(filters);
  }
  function page(value) {
    const next = new URLSearchParams(params);
    next.set('page', String(value));
    setParams(next);
    document.getElementById('fresh-finds').scrollIntoView({ behavior: 'smooth' });
  }
  return (
    <>
      <section className="browse-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow muted">FIND YOUR KIND OF TREASURE</span>
            <h2>
              A little something for everyone<span className="purple-dot">.</span>
            </h2>
          </div>
          <span className="section-aside">Old favourites. New possibilities.</span>
        </div>
        <div className="categories live-categories">
          {['', ...categories].map((category, index) => {
            const Icon = icons[index];
            const selected = (params.get('category') || '') === category;
            return (
              <button
                type="button"
                className={'category ' + (selected ? 'category-active' : '')}
                aria-pressed={selected}
                key={category}
                onClick={() => apply({ ...filters, category })}
              >
                <span className={'category-icon tone-' + tones[index]}>
                  <Icon size={22} strokeWidth={1.5} />
                </span>
                <span>{category || 'All finds'}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section id="fresh-finds" className="finds-section">
        <div className="section-heading">
          <div>
            <h2>
              Fresh finds, second chances <Sparkles size={23} />
            </h2>
            <p>Good things waiting for their next chapter.</p>
          </div>
          {!loading && !error && (
            <span className="preview-label">{result?.total || 0} active finds</span>
          )}
        </div>
        <form className="marketplace-filters surface" onSubmit={submit}>
          <Input
            label="Search title"
            name="search"
            placeholder="What are you looking for?"
            value={filters.search}
            onChange={change}
            maxLength={120}
          />
          <Select
            label="Category"
            name="category"
            options={categories}
            placeholder="All categories"
            value={filters.category}
            onChange={change}
          />
          <Select
            label="Condition"
            name="condition"
            options={conditions}
            placeholder="Any condition"
            value={filters.condition}
            onChange={change}
          />
          <Select
            label="State / Federal territory"
            name="state"
            options={states}
            placeholder="Anywhere in Malaysia"
            value={filters.state}
            onChange={change}
          />
          <Input
            label="City / Area"
            name="city"
            placeholder="e.g. Shah Alam"
            value={filters.city}
            onChange={change}
            maxLength={80}
          />
          <Input
            label="Min price (RM)"
            name="minPrice"
            type="number"
            min="0"
            max="999999.99"
            step="0.01"
            value={filters.minPrice}
            onChange={change}
          />
          <Input
            label="Max price (RM)"
            name="maxPrice"
            type="number"
            min="0"
            max="999999.99"
            step="0.01"
            value={filters.maxPrice}
            onChange={change}
          />
          <div className="field">
            <label htmlFor="listing-sort">Sort by</label>
            <select id="listing-sort" name="sort" value={filters.sort} onChange={change}>
              <option value="newest">Newest first</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
          <div className="filter-actions">
            <Button type="submit">Find treasures</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setFilters(defaults);
                setParams({});
                setError('');
              }}
            >
              Clear filters
            </Button>
          </div>
        </form>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <div className="empty-state">
            <p className="form-message error-message" role="alert">
              {error}
            </p>
            <Button onClick={() => setRetry((value) => value + 1)}>Try again</Button>
          </div>
        ) : result?.listings.length ? (
          <>
            <div className="listing-grid">
              {result.listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            <div className="pagination">
              <Button
                variant="secondary"
                disabled={result.page <= 1}
                onClick={() => page(result.page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {result.page} of {result.pages}
              </span>
              <Button
                variant="secondary"
                disabled={result.page >= result.pages}
                onClick={() => page(result.page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            title="A little space for new finds"
            description="No active listings match these filters. Try a different search, or give something of yours another life."
            action={false}
          />
        )}
      </section>
    </>
  );
}
