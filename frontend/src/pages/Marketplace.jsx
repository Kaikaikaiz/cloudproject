import {
  ArrowUpRight,
  ArrowRight,
  Leaf,
  Sparkles,
  Shirt,
  Armchair,
  BookOpen,
  Headphones,
  Shapes,
  Recycle,
  Plus,
} from 'lucide-react';
import Button from '../components/Button';
import MarketplaceBrowser from '../components/MarketplaceBrowser';
import ItemArt from '../components/ItemArt';
export default function Marketplace() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-spark">✳</span> PRE-LOVED. RE-LOVED.
          </span>
          <h1>
            Good finds.
            <br />
            Fresh{' '}
            <span>
              beginnings
              <svg viewBox="0 0 340 16" aria-hidden="true">
                <path
                  d="M3 11Q150-3 337 8"
                  stroke="#b29bcd"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            .
          </h1>
          <p>
            A little less new. A lot more you.
            <br />
            Discover pre-loved treasures and give your favourites
            <br className="desktop-break" /> a happy new home.
          </p>
          <div className="hero-actions">
            <Button
              to="#fresh-finds"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById('fresh-finds')
                  .scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Explore the finds <ArrowUpRight size={18} />
            </Button>
            <Button to="/sell" variant="ghost">
              Start selling <ArrowRight size={17} />
            </Button>
          </div>
          <span className="hero-footnote">
            <Leaf size={15} /> Small choices. A little kinder to the planet.
          </span>
        </div>
        <div className="hero-art">
          <span className="art-star star-one">✳</span>
          <span className="art-star star-two">✧</span>
          <div className="hero-circle" />
          <div className="floating-card card-back">
            <ItemArt kind="lamp" />
            <span>Still full of bright ideas.</span>
            <b>
              RM 28 <span>↗</span>
            </b>
          </div>
          <div className="floating-card card-front">
            <ItemArt kind="tote" />
            <span>Someone’s old favourite.</span>
            <b>
              Your new everyday. <span>♡</span>
            </b>
          </div>
          <div className="life-sticker">
            <Recycle size={21} />
            <span>
              Give it
              <br />
              <b>another life.</b>
            </span>
          </div>
          <span className="art-caption">a new chapter looks good on you ↗</span>
        </div>
      </section>
      <section className="values-strip" aria-label="Our values">
        <span>
          <Recycle size={18} /> Second-hand, first choice
        </span>
        <i />
        <span>
          <HeartIcon /> Little prices, lovely finds
        </span>
        <i />
        <span>
          <Leaf size={18} /> More reuse. Less waste.
        </span>
      </section>
      <MarketplaceBrowser />
      <section className="sell-banner">
        <div className="banner-icon">
          <Recycle size={37} strokeWidth={1.3} />
          <span>✦</span>
        </div>
        <div>
          <span className="eyebrow">MAKE ROOM FOR WHAT’S NEXT</span>
          <h2>
            Something you’ve loved.
            <br />
            Something they’ll love.
          </h2>
          <p>That little thing sitting around could make someone’s day.</p>
        </div>
        <Button to="/sell" variant="white">
          <Plus size={17} /> Give it another life <ArrowUpRight size={17} />
        </Button>
      </section>
    </>
  );
}
function HeartIcon() {
  return (
    <span aria-hidden="true" className="heart-outline">
      ♡
    </span>
  );
}
