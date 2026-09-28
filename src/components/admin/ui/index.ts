/*
 * The admin UI kit. Import from "@/components/admin/ui".
 *
 * Server-compatible (no hooks beyond useId): AdminPageHeader, AdminBreadcrumbs,
 * AdminSection, DataTable (THead, TBody, TFoot, Tr, Th, Td, RowHeader, RowLink,
 * TableMessageRow), Pagination, StatusBadge, StatGrid/Stat, AdminEmptyState,
 * KeyValueList, the skeletons and the class strings in field-styles.
 * Client components (usable from server components with serialisable props):
 * AdminForm, the fields (TextField … ListField, FieldShell), FormStatus,
 * SubmitButton, ListToolbar, ConfirmDialog. Client-only hooks: useAdminForm,
 * useAdminFieldError, useFieldIds.
 */

export { AdminBreadcrumbs, AdminPageHeader, type AdminBreadcrumb, type AdminPageHeaderProps } from "./page-header";
export { AdminSection, type AdminSectionProps } from "./section";
export {
  DataTable,
  RowHeader,
  RowLink,
  TBody,
  TFoot,
  THead,
  TableMessageRow,
  Td,
  Th,
  Tr,
  type DataTableProps,
  type RowHeaderProps,
  type TdProps,
  type ThProps,
  type TrProps,
} from "./data-table";
export { Pagination, type PaginationProps } from "./pagination";
export { ListToolbar, type ListToolbarFilter, type ListToolbarProps } from "./list-toolbar";
export { StatusBadge, type StatusBadgeProps, type StatusTone } from "./status-badge";
export { Stat, StatGrid, type StatDelta, type StatProps } from "./stat";
export { AdminEmptyState, type AdminEmptyStateProps } from "./empty-state";
export { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";
export {
  AdminForm,
  useAdminFieldError,
  useAdminForm,
  type AdminFormAction,
  type AdminFormProps,
} from "./admin-form";
export { adminControlClassName, adminSelectClassName } from "./field-styles";
export {
  CheckboxField,
  FieldShell,
  MoneyField,
  NumberField,
  SelectChevron,
  SelectField,
  TextAreaField,
  TextField,
  useFieldIds,
  type CheckboxFieldProps,
  type FieldBaseProps,
  type MoneyFieldProps,
  type NumberFieldProps,
  type SelectFieldProps,
  type SelectOption,
  type TextAreaFieldProps,
  type TextFieldProps,
} from "./fields";
export { ListField, type ListFieldProps } from "./list-field";
export { FormStatus, type FormStatusProps } from "./form-status";
export { SubmitButton, type SubmitButtonProps } from "./submit-button";
export { FormSkeleton, PageHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "./skeletons";
export { KeyValueList, type KeyValueItem } from "./key-value";
