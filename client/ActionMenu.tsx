import * as Menu from "@radix-ui/react-dropdown-menu";

export function ActionMenu({
  label,
  actions,
  note,
}: {
  label: string;
  actions: { label: string; run: () => void; disabled?: boolean }[];
  note?: string;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className="studio-select action-trigger">
        <span>{label}</span>
        <svg
          className="select-chevron"
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="m5 8 5 5 5-5" />
        </svg>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="select-menu action-menu"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          {actions.map((action) => (
            <Menu.Item
              key={action.label}
              className="select-option"
              disabled={action.disabled}
              onSelect={action.run}
            >
              {action.label}
            </Menu.Item>
          ))}
          {note && <div className="select-footnote">{note}</div>}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
