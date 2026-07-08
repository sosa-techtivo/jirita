"use client";

export function FilterChips<T extends string>({
  options,
  active,
  onChange,
}: {
  options: { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {options.map((item) => {
        const isActive = active === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`text-sm px-3 py-1.5 rounded-md whitespace-nowrap flex-shrink-0 transition-colors ${
              isActive
                ? "bg-slate-100 text-slate-900 font-medium dark:bg-zinc-800 dark:text-zinc-100"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
