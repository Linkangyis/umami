import { Button, Icon, Menu, MenuItem, MenuTrigger, SearchField } from '@umami/react-zen';
import { Children, type ReactNode } from 'react';
import { useMessages } from '@/components/hooks';
import { ChevronRight } from '@/components/icons';

const listStyle = {
  maxHeight: 'min(320px, calc(100dvh - 8rem))',
  overflowY: 'auto' as const,
};

const menuItemProps = { closeOnClick: false };

interface MultiSelectProps {
  value?: string[];
  onChange?: (values: string[]) => void;
  searchValue?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  allowSearch?: boolean;
  renderEmptyState?: () => ReactNode;
  renderValue?: (values: string[]) => ReactNode;
  children: ReactNode;
}

export function MultiSelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <MenuItem id={value} {...menuItemProps}>
      {children}
    </MenuItem>
  );
}

export function MultiSelect({
  value = [],
  onChange,
  searchValue,
  onSearch,
  placeholder,
  allowSearch,
  renderEmptyState,
  renderValue,
  children,
}: MultiSelectProps) {
  const { t, labels } = useMessages();
  const displayValue = renderValue
    ? renderValue(value)
    : value.length > 0
      ? value.join(', ')
      : null;

  return (
    <MenuTrigger>
      <Button
        variant="outline"
        className="w-full justify-between"
        style={{ maxWidth: '100%', overflow: 'hidden' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayValue ?? placeholder ?? t(labels.select)}
        </span>
        <Icon rotate={90} size="sm" aria-hidden="true">
          <ChevronRight />
        </Icon>
      </Button>
      <Menu
        selectionMode="multiple"
        selectedKeys={value}
        onSelectionChange={keys =>
          onChange?.(keys === 'all' ? [] : Array.from(keys, key => String(key)))
        }
        className="flex flex-col gap-2"
        style={{
          width: 'var(--anchor-width)',
          maxWidth: 'var(--available-width)',
        }}
      >
        {allowSearch && (
          <SearchField
            aria-label={t(labels.search)}
            placeholder={t(labels.search)}
            value={searchValue}
            onSearch={onSearch}
            autoFocus
            onKeyDown={event => {
              if (event.key !== 'Escape' && event.key !== 'Tab') {
                event.stopPropagation();
              }
            }}
          />
        )}
        <div style={listStyle}>
          {children}
          {Children.count(children) === 0 && renderEmptyState?.()}
        </div>
      </Menu>
    </MenuTrigger>
  );
}
