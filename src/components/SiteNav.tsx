import { Link } from "@tanstack/react-router";

export function SiteNav() {
  return (
    <nav className="relative z-20 flex items-center justify-between px-6 md:px-10 h-20 border-b border-white/5 bg-carbon-950/80 backdrop-blur-md">
      <div className="flex items-center gap-10">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="size-6 bg-electric rounded-sm rotate-45 flex items-center justify-center transition-transform group-hover:rotate-[135deg] duration-500">
            <div className="size-2 bg-carbon-950 rounded-full" />
          </div>
          <span className="font-mono text-foreground font-medium tracking-tight">
            COREFLOW
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <a href="#protocols" className="hover:text-electric transition-colors">
            Protocols
          </a>
          <a href="#telemetry" className="hover:text-electric transition-colors">
            Telemetry
          </a>
          <a href="#integrations" className="hover:text-electric transition-colors">
            Integrations
          </a>
          <a href="#pricing" className="hover:text-electric transition-colors">
            Pricing
          </a>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="hidden sm:inline-flex px-4 py-1.5 text-xs font-mono border border-white/10 hover:border-electric/50 text-foreground transition-colors">
          [ LOGIN ]
        </button>
        <button className="px-4 py-1.5 text-xs font-mono bg-electric text-primary-foreground font-bold hover:bg-foreground transition-colors">
          INITIALIZE_CLUSTER
        </button>
      </div>
    </nav>
  );
}
