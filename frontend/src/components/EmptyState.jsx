import { Sparkles } from 'lucide-react';
import Button from './Button';
export default function EmptyState({ title, description, icon: Icon = Sparkles, action = true }) {
 return <div className="empty-state"><span className="empty-icon"><Icon size={30} strokeWidth={1.5}/></span><h2>{title}</h2><p>{description}</p>{action && <Button to="/" variant="secondary">Explore the marketplace <span aria-hidden="true">↗</span></Button>}</div>;
}
