import { Button, Column, ListItem, Row, Select, Text, TextField } from '@umami/react-zen';
import { useState } from 'react';
import { ConfirmationForm } from '@/components/common/ConfirmationForm';
import { useApi, useLocale, useMessages } from '@/components/hooks';
import { DialogButton } from '@/components/input/DialogButton';
import {
  type ContentGroupDefinition,
  type ContentGroupRule,
  contentGroupSchema,
} from '@/lib/content-report';
import { getContentCopy } from './contentCopy';

export function ContentGroupsManager({
  websiteId,
  onChange,
}: {
  websiteId: string;
  onChange: () => void;
}) {
  const { locale } = useLocale();
  const text = getContentCopy(locale);
  const { t, messages, getErrorMessage } = useMessages();
  const { get, post, put, del, useQuery } = useApi();
  const query = useQuery<{ data: ContentGroupDefinition[]; canManage: boolean }>({
    queryKey: ['content-groups', websiteId],
    queryFn: () => get(`/websites/${websiteId}/content-groups`),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [rules, setRules] = useState<ContentGroupRule[]>([
    { field: 'route', operator: 'prefix', value: '' },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setEditing(null);
    setName('');
    setRules([{ field: 'route', operator: 'prefix', value: '' }]);
    setError(null);
  };
  const updateRule = (index: number, values: Partial<ContentGroupRule>) =>
    setRules(rules.map((rule, i) => (i === index ? { ...rule, ...values } : rule)));
  const saved = async () => {
    await query.refetch();
    onChange();
  };
  const save = async () => {
    const result = contentGroupSchema.safeParse({ name, rules });
    if (!result.success) {
      setError(text.groupError);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const path = `/websites/${websiteId}/content-groups`;
      if (editing) await put(`${path}/${editing}`, result.data);
      else await post(path, result.data);
      await saved();
      reset();
    } catch (error) {
      setError(getErrorMessage(error as Error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Column gap="4" data-test="content-group-manager">
      <Text size="sm">{text.groupHint}</Text>
      <Text size="sm" color="muted">
        {text.groupsDefinition} {text.groupLimit}
      </Text>
      {query.data?.canManage && (
        <>
          <TextField
            label={text.groupName}
            aria-label={text.groupName}
            value={name}
            onChange={setName}
            maxLength={200}
          />
          {rules.map((rule, index) => (
            <Column key={index} gap="2" border borderRadius padding="3">
              <Row gap="3" wrap="wrap">
                <Select
                  label={text.ruleField}
                  aria-label={text.ruleField}
                  value={rule.field}
                  onChange={field =>
                    updateRule(index, { field: field as ContentGroupRule['field'] })
                  }
                >
                  <ListItem id="route">{text.route}</ListItem>
                  <ListItem id="path">{text.path}</ListItem>
                  <ListItem id="hostname">{text.hostname}</ListItem>
                </Select>
                <Select
                  label={text.ruleOperator}
                  aria-label={text.ruleOperator}
                  value={rule.operator}
                  onChange={operator =>
                    updateRule(index, { operator: operator as ContentGroupRule['operator'] })
                  }
                >
                  <ListItem id="exact">{text.exact}</ListItem>
                  <ListItem id="prefix">{text.prefix}</ListItem>
                  <ListItem id="contains">{text.contains}</ListItem>
                </Select>
              </Row>
              <TextField
                label={text.ruleValue}
                aria-label={text.ruleValue}
                value={rule.value}
                onChange={value => updateRule(index, { value })}
                maxLength={1500}
                placeholder="/?products/"
              />
              {rules.length > 1 && (
                <Row>
                  <Button
                    variant="quiet"
                    onClick={() => setRules(rules.filter((_, i) => i !== index))}
                  >
                    {text.removeRule}
                  </Button>
                </Row>
              )}
            </Column>
          ))}
          <Row gap="3" wrap="wrap">
            <Button
              onClick={() =>
                setRules([...rules, { field: 'route', operator: 'prefix', value: '' }])
              }
              isDisabled={rules.length >= 20 || pending}
            >
              {text.addRule}
            </Button>
            <Button onClick={save} variant="primary" isDisabled={pending}>
              {text.saveGroup}
            </Button>
            {editing && <Button onClick={reset}>{text.newGroup}</Button>}
          </Row>
        </>
      )}
      {(error || query.error) && <Text role="alert">{error || getErrorMessage(query.error)}</Text>}
      {query.data?.data.map(group => (
        <Column key={group.id} border="top" paddingTop="3" gap="2" data-test="content-group-item">
          <Text weight="bold">{group.name}</Text>
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
            {group.rules
              .map(rule => `${text[rule.field]} ${text[rule.operator]} ${rule.value}`)
              .join(' · ')}
          </Text>
          {query.data.canManage && (
            <Row gap="2">
              <Button
                variant="quiet"
                onClick={() => {
                  setEditing(group.id);
                  setName(group.name);
                  setRules(group.rules.map(rule => ({ ...rule })));
                  setError(null);
                }}
              >
                {text.edit}
              </Button>
              <DialogButton label={text.remove} title={text.remove} variant="quiet" width="440px">
                {({ close }) => (
                  <ConfirmationForm
                    message={t(messages.confirmDelete, { target: group.name })}
                    buttonLabel={text.remove}
                    buttonVariant="danger"
                    isLoading={pending}
                    error={error}
                    onClose={close}
                    onConfirm={async () => {
                      setPending(true);
                      setError(null);
                      try {
                        await del(`/websites/${websiteId}/content-groups/${group.id}`);
                        if (editing === group.id) reset();
                        await saved();
                        close();
                      } catch (error) {
                        setError(getErrorMessage(error as Error));
                      } finally {
                        setPending(false);
                      }
                    }}
                  />
                )}
              </DialogButton>
            </Row>
          )}
        </Column>
      ))}
    </Column>
  );
}
