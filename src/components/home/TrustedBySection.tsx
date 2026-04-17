import { Building2, HardHat, Hotel, ShoppingBag, Wrench } from 'lucide-react';

const brands = [
  { name: 'RealEstate Co.', icon: Building2 },
  { name: 'AutoGear Shop', icon: Wrench },
  { name: 'QuickGas', icon: ShoppingBag },
  { name: 'DiningGroup', icon: Hotel },
  { name: 'BuildTech', icon: HardHat },
];

export function TrustedBySection() {
  return (
    <section className="mt-10 border-y border-slate-200 bg-white">
      <div className="section-shell py-4">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Trusted by</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-slate-600 sm:grid-cols-3 lg:grid-cols-5">
          {brands.map((brand) => {
            const Icon = brand.icon;
            return (
              <div key={brand.name} className="flex items-center justify-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4 text-slate-500" />
                <span>{brand.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
