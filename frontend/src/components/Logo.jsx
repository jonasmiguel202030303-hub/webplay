import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';

export default function Logo({ to = '/', className = '' }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`} aria-label="WebPlay Brasil">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
        <Play className="h-4 w-4 fill-white" aria-hidden />
      </span>
      <span>WebPlay<span className="text-primary"> Brasil</span></span>
    </Link>
  );
}
