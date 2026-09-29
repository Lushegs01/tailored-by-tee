/*
 * Class strings shared by the admin form controls. A plain module (not "use
 * client"), so server components can use the strings too.
 */

/** Dense control sizing for an <Input> in admin forms: h-10, body-sm. */
export const adminControlClassName = "h-10 px-3 text-body-sm";

/** A native <select> styled like the admin inputs. Put it in a `relative` wrapper with <SelectChevron />. */
export const adminSelectClassName =
  "h-10 w-full cursor-pointer appearance-none border border-input bg-transparent pl-3 pr-9 text-body-sm text-foreground transition-[border-color,box-shadow] duration-300 ease-editorial focus-visible:border-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--foreground)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";
