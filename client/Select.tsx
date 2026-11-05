import * as Select from "@radix-ui/react-select";
export type StudioOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};
const empty = "__studio_empty__";
export function StudioSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Choose",
  variant = "quiet",
}: {
  label: string;
  value: string;
  options: StudioOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  variant?: "quiet" | "project";
}) {
  return (
    <Select.Root
      value={value ? "value:" + value : empty}
      onValueChange={(v) => onChange(v === empty ? "" : v.slice(6))}
      disabled={disabled}
    >
      <Select.Trigger className={"studio-select " + variant} aria-label={label}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="select-chevron">
          <svg
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
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className={
            "select-menu " + (variant === "project" ? "project-menu" : "")
          }
          position="popper"
          sideOffset={8}
          collisionPadding={12}
          align="start"
        >
          <Select.ScrollUpButton className="select-scroll">
            Scroll up
          </Select.ScrollUpButton>
          <Select.Viewport>
            {!options.length && (
              <Select.Item value={empty} disabled className="select-option">
                <Select.ItemText>{placeholder}</Select.ItemText>
              </Select.Item>
            )}
            {options.map((option) => (
              <Select.Item
                className="select-option"
                key={option.value || empty}
                value={option.value ? "value:" + option.value : empty}
                disabled={option.disabled}
                textValue={option.label}
              >
                <div className="option-copy">
                  <Select.ItemText>{option.label}</Select.ItemText>
                  {option.description && <small>{option.description}</small>}
                </div>
                <Select.ItemIndicator className="select-check">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="m4 10 4 4 8-8" />
                  </svg>
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="select-scroll">
            Scroll down
          </Select.ScrollDownButton>
          {variant === "project" && (
            <div className="select-footnote">
              Projects are created through Codex.
            </div>
          )}
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
