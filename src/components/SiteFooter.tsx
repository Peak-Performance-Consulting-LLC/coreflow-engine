export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-white/5">
      <div className="px-6 md:px-10 py-16 max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-10">
        <div className="col-span-2 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="size-6 bg-electric rounded-sm rotate-45 flex items-center justify-center">
              <div className="size-2 bg-carbon-950 rounded-full" />
            </div>
            <span className="font-mono text-foreground font-medium tracking-tight">
              COREFLOW
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            Programmable workflow infrastructure for systems that cannot afford
            to fail.
          </p>
        </div>

        {[
          {
            title: "System",
            links: ["Protocols", "Telemetry", "Integrations", "Status"],
          },
          {
            title: "Resources",
            links: ["Documentation", "Architecture", "Changelog", "API"],
          },
          {
            title: "Company",
            links: ["About", "Careers", "Security", "Contact"],
          },
        ].map((col) => (
          <div key={col.title}>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
              {col.title}
            </div>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l}>
                  <a
                    href="#"
                    className="text-sm text-foreground hover:text-electric transition-colors"
                  >
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="px-6 md:px-10 py-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          © 2026 CoreFlow Systems / No. 49201-B
        </div>
        <div className="flex gap-6 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          <a href="#" className="hover:text-foreground transition-colors">
            Architecture
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Security
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Latency_Map
          </a>
        </div>
      </div>
    </footer>
  );
}
