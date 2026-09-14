import { expect, test } from 'vitest';
import { translateBoardComponentText } from './boardComponentLocale';
import { getComponentDefinitions } from './boardComponentRegistry';

test('localizes every board component title, description and config label without changing identifiers', () => {
  const english = getComponentDefinitions('en-US');
  const localized = getComponentDefinitions('zh-CN');
  english.forEach((definition, index) => {
    const translated = localized[index];
    expect(translated.type).toBe(definition.type);
    expect(translated.component).toBe(definition.component);
    if (definition.name !== 'UTM') expect(translated.name).not.toBe(definition.name);
    expect(translated.description).not.toBe(definition.description);
    definition.configFields?.forEach((field, fieldIndex) => {
      const target = translated.configFields[fieldIndex];
      expect(target.name).toBe(field.name);
      expect(target.label).not.toBe(field.label);
      field.options?.forEach((option, optionIndex) => {
        expect(target.options[optionIndex].value).toBe(option.value);
        if (/[A-Za-z]/.test(option.label))
          expect(target.options[optionIndex].label).not.toBe(option.label);
      });
    });
  });
  expect(getComponentDefinitions()).toBe(english);
});

test('translates group names and currency labels while leaving unknown user strings intact', () => {
  expect(translateBoardComponentText('Traffic', 'zh-CN')).toBe('流量分析');
  expect(translateBoardComponentText('USD - US Dollar', 'zh-CN')).toBe('USD · 美元');
  expect(translateBoardComponentText('Customer-defined title', 'zh-CN')).toBe(
    'Customer-defined title',
  );
});
