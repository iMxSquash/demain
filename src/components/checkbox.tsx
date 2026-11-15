import type { ComponentPropsWithRef, ReactNode } from "react";

// DESIGN section 8, "Checkbox": a 20 px native box (6 px radius, 1.5 px border) inside a 44 px row.
// The browser keeps drawing nothing (`appearance-none`): the box and its tick are CSS, so the
// native input keeps its checked state, its form value and its keyboard behaviour without JavaScript.
const ROW_CLASS =
  "group/checkbox flex min-h-11 cursor-pointer items-start gap-3 has-disabled:cursor-not-allowed has-disabled:text-text-muted";
const BOX_CLASS =
  "peer absolute inset-0 size-5 cursor-[inherit] appearance-none rounded-[6px] border-[1.5px] border-border-control bg-control transition-colors " +
  "group-hover/checkbox:enabled:border-text checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary " +
  "disabled:border-divider disabled:bg-surface-sunken";
// The tick is a 2 px corner turned 45 degrees; the same shape flattens into a dash when indeterminate.
const TICK_CLASS =
  "pointer-events-none relative -mt-0.5 h-2.5 w-1.5 rotate-45 border-r-2 border-b-2 border-on-primary opacity-0 transition-opacity " +
  "peer-checked:opacity-100 peer-indeterminate:mt-0 peer-indeterminate:h-0 peer-indeterminate:w-2.5 peer-indeterminate:rotate-0 peer-indeterminate:border-r-0 peer-indeterminate:opacity-100 " +
  "peer-disabled:border-text-muted";

type CheckboxProps = Omit<ComponentPropsWithRef<"input">, "type" | "className" | "children"> & {
  /** The visible label. Without it the box is a 44 px square and needs an `aria-label`. */
  label?: ReactNode;
};

export function Checkbox({ label, ...rest }: CheckboxProps) {
  return (
    <label className={label === undefined ? `${ROW_CLASS} min-w-11 justify-center` : ROW_CLASS}>
      <span className="relative mt-3 grid size-5 shrink-0 place-items-center">
        <input {...rest} type="checkbox" className={BOX_CLASS} />
        <span aria-hidden="true" className={TICK_CLASS} />
      </span>
      {label === undefined ? null : <span className="py-2.5">{label}</span>}
    </label>
  );
}
