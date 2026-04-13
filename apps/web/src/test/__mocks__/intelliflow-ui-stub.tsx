import React from 'react';

// Stub for @intelliflow/ui — renders simple divs for test environments.
// Every UI component is a transparent wrapper that forwards children + props so
// assertions keyed on visible text / aria roles keep working without pulling in
// the full Radix / shadcn stack.

type AnyProps = Readonly<{
  children?: React.ReactNode;
  className?: string;
  id?: string;
  [key: string]: unknown;
}>;

function wrap(tag: 'div' | 'span' | 'button' | 'p' | 'label', testId?: string) {
  return ({ children, id, className, ...props }: AnyProps) =>
    React.createElement(
      tag,
      { id, className, 'data-testid': testId, ...props },
      children as React.ReactNode
    );
}

export const Card = wrap('div', 'card');
export const CardHeader = wrap('div');
export const CardTitle = wrap('div');
export const CardDescription = wrap('div');
export const CardContent = wrap('div');
export const CardFooter = wrap('div');

export const Button = wrap('button');
export const Badge = wrap('span', 'badge');
export const Skeleton = wrap('div', 'skeleton');
export const Progress = wrap('div');
export const Separator = wrap('div');
export const Input = wrap('div');
export const Label = wrap('label');
export const Textarea = wrap('div');

export const HoverCard = wrap('div');
export const HoverCardTrigger = wrap('div');
export const HoverCardContent = wrap('div');
export const HoverCardPortal = wrap('div');

export const DropdownMenu = wrap('div');
export const DropdownMenuTrigger = wrap('div');
export const DropdownMenuContent = wrap('div');
export const DropdownMenuItem = wrap('div');
export const DropdownMenuSeparator = wrap('div');
export const DropdownMenuLabel = wrap('div');
export const DropdownMenuGroup = wrap('div');
export const DropdownMenuSub = wrap('div');
export const DropdownMenuSubTrigger = wrap('div');
export const DropdownMenuSubContent = wrap('div');
export const DropdownMenuPortal = wrap('div');
export const DropdownMenuCheckboxItem = wrap('div');
export const DropdownMenuRadioGroup = wrap('div');
export const DropdownMenuRadioItem = wrap('div');
export const DropdownMenuShortcut = wrap('span');

export const Dialog = wrap('div');
export const DialogTrigger = wrap('div');
export const DialogContent = wrap('div');
export const DialogHeader = wrap('div');
export const DialogFooter = wrap('div');
export const DialogTitle = wrap('div');
export const DialogDescription = wrap('div');
export const DialogClose = wrap('div');

export const Sheet = wrap('div');
export const SheetTrigger = wrap('div');
export const SheetContent = wrap('div');
export const SheetHeader = wrap('div');
export const SheetFooter = wrap('div');
export const SheetTitle = wrap('div');
export const SheetDescription = wrap('div');
export const SheetClose = wrap('div');

export const Tabs = wrap('div');
export const TabsList = wrap('div');
export const TabsTrigger = wrap('div');
export const TabsContent = wrap('div');

export const Tooltip = wrap('div');
export const TooltipTrigger = wrap('div');
export const TooltipContent = wrap('div');
export const TooltipProvider = wrap('div');

export const Popover = wrap('div');
export const PopoverTrigger = wrap('div');
export const PopoverContent = wrap('div');

export const Select = wrap('div');
export const SelectTrigger = wrap('div');
export const SelectValue = wrap('span');
export const SelectContent = wrap('div');
export const SelectItem = wrap('div');
export const SelectLabel = wrap('div');
export const SelectSeparator = wrap('div');
export const SelectGroup = wrap('div');

export const Alert = wrap('div');
export const AlertTitle = wrap('div');
export const AlertDescription = wrap('div');

export const AlertDialog = wrap('div');
export const AlertDialogAction = wrap('button');
export const AlertDialogCancel = wrap('button');
export const AlertDialogContent = wrap('div');
export const AlertDialogDescription = wrap('div');
export const AlertDialogFooter = wrap('div');
export const AlertDialogHeader = wrap('div');
export const AlertDialogTitle = wrap('div');
export const AlertDialogTrigger = wrap('div');
export const AlertDialogPortal = wrap('div');
export const AlertDialogOverlay = wrap('div');

export const Avatar = wrap('div');
export const AvatarImage = wrap('span');
export const AvatarFallback = wrap('span');

export const ScrollArea = wrap('div');
export const ScrollBar = wrap('div');

export const Accordion = wrap('div');
export const AccordionItem = wrap('div');
export const AccordionTrigger = wrap('button');
export const AccordionContent = wrap('div');

export const Collapsible = wrap('div');
export const CollapsibleTrigger = wrap('div');
export const CollapsibleContent = wrap('div');

export const Checkbox = wrap('div');
export const RadioGroup = wrap('div');
export const RadioGroupItem = wrap('div');
export const Switch = wrap('div');
export const Slider = wrap('div');

export const Table = wrap('div');
export const TableBody = wrap('div');
export const TableCaption = wrap('div');
export const TableCell = wrap('div');
export const TableFooter = wrap('div');
export const TableHead = wrap('div');
export const TableHeader = wrap('div');
export const TableRow = wrap('div');

export const EmptyState = ({
  title,
  description,
  children,
  ...props
}: AnyProps & { title?: React.ReactNode; description?: React.ReactNode }) => (
  <div data-testid="empty-state" {...props}>
    {title ? <div>{title}</div> : null}
    {description ? <div>{description}</div> : null}
    {children as React.ReactNode}
  </div>
);

export const Toaster = () => null;
export const Sonner = () => null;
export const CookieConsentBanner = () => null;

export const toast = Object.assign(() => undefined, {
  success: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warning: () => undefined,
  loading: () => undefined,
  dismiss: () => undefined,
  promise: () => undefined,
});

export const useToast = () => ({ toast, dismiss: () => undefined, toasts: [] });
export const useEmptyStateMachine = () => ({ state: 'idle', transition: () => undefined });

export const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export default {};
