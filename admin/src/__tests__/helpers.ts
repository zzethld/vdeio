import { vi } from 'vitest';
import { defineComponent, h, provide, inject } from 'vue';
import type { Component } from 'vue';

/**
 * A custom ElForm stub that exposes a controllable `validate` method.
 * Tests override return value via the returned controller.
 */
export function createElFormStub() {
  let validateImpl: () => Promise<boolean> = () => Promise.resolve(true);

  const ElFormStub = defineComponent({
    name: 'ElForm',
    inheritAttrs: false,
    setup(_props, { slots, expose, attrs }) {
      function validate() {
        return validateImpl();
      }
      function resetFields() {}
      function clearValidate() {}
      expose({ validate, resetFields, clearValidate });
      return () =>
        h('form', { class: 'el-form-stub', ...attrs }, slots.default?.());
    },
  });

  return {
    ElFormStub,
    setValidate(impl: () => Promise<boolean>) {
      validateImpl = impl;
    },
    setValidity(valid: boolean) {
      validateImpl = () => Promise.resolve(valid);
    },
  };
}

/** Provide key for the current row passed from ElTable to ElTableColumn. */
const RowKey = Symbol('el-table-row');

/**
 * Internal wrapper that provides the row to descendant ElTableColumn stubs.
 */
const RowContextProvider = defineComponent({
  name: 'RowContextProvider',
  props: { row: { type: null, default: undefined }, idx: { type: Number, default: 0 } },
  setup(props, { slots }) {
    provide(RowKey, { row: props.row, idx: props.idx });
    return () => slots.default?.();
  },
});

/**
 * ElTable stub: renders the default scoped slot per row so cell text is queryable.
 * Each row wraps content in RowContextProvider so ElTableColumn stubs can access
 * the row via inject (mirrors Element Plus' scoped slot behaviour).
 */
const ElTableStub = defineComponent({
  name: 'ElTable',
  inheritAttrs: false,
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots, attrs }) {
    return () =>
      h('table', { class: 'el-table-stub', ...attrs }, [
        h(
          'tbody',
          props.data.map((row: unknown, idx: number) =>
            h(
              'tr',
              { class: 'el-table-stub-row', key: idx },
              h(RowContextProvider, { row, idx }, {
                default: () =>
                  slots.default ? slots.default({ row, $index: idx }) : null,
              }),
            ),
          ),
        ),
      ]);
  },
});

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumn',
  inheritAttrs: false,
  props: { prop: String, label: String, width: [String, Number] },
  setup(props, { slots }) {
    const ctx = inject(RowKey, { row: undefined, idx: 0 });
    return () =>
      h('td', { class: 'el-table-column-stub', 'data-prop': props.prop ?? '' }, [
        slots.default ? slots.default({ row: ctx.row, $index: ctx.idx }) : null,
      ]);
  },
});

/** Convert PascalCase name to kebab-case (e.g. ElSelect -> el-select). */
function kebab(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Generic stub: passes attrs, renders slot. */
function passthroughStub(name: string, tag = 'div'): Component {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { slots, attrs }) {
      return () =>
        h(tag, { class: `${kebab(name)}-stub`, ...attrs }, slots.default?.());
    },
  }) as Component;
}

const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '' },
    width: { type: [String, Number], default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h('div', { class: 'el-dialog-stub' }, [
            props.title ? h('div', { class: 'el-dialog-stub__title' }, props.title) : null,
            slots.default?.(),
            slots.footer?.(),
          ])
        : null;
  },
});

const ElButtonStub = defineComponent({
  name: 'ElButton',
  props: ['type', 'loading', 'disabled', 'icon'],
  emits: ['click'],
  setup(props, { slots, emit }) {
    return () =>
      h(
        'button',
        {
          class: ['el-button-stub', props.type].filter(Boolean).join(' '),
          disabled: Boolean(props.disabled || props.loading),
          onClick: (e: Event) => emit('click', e),
        },
        slots.default?.(),
      );
  },
});

const ElInputStub = defineComponent({
  name: 'ElInput',
  props: {
    modelValue: { type: [String, Number], default: '' },
    type: { type: String, default: 'text' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        class: 'el-input-stub',
        type: props.type,
        value: props.modelValue,
        onInput: (e: Event) =>
          emit('update:modelValue', (e.target as HTMLInputElement).value),
      });
  },
});

export const commonStubs: Record<string, Component> = {
  ElTable: ElTableStub,
  ElTableColumn: ElTableColumnStub,
  ElDialog: ElDialogStub,
  ElButton: ElButtonStub,
  ElInput: ElInputStub,
  ElCard: passthroughStub('ElCard'),
  ElRow: passthroughStub('ElRow'),
  ElCol: passthroughStub('ElCol'),
  ElIcon: passthroughStub('ElIcon'),
  ElForm: passthroughStub('ElForm', 'form'),
  ElFormItem: passthroughStub('ElFormItem'),
  ElPagination: passthroughStub('ElPagination'),
  ElSelect: passthroughStub('ElSelect'),
  ElOption: passthroughStub('ElOption'),
  ElTag: passthroughStub('ElTag', 'span'),
  ElDescriptions: passthroughStub('ElDescriptions'),
  ElDescriptionsItem: passthroughStub('ElDescriptionsItem'),
  ElProgress: passthroughStub('ElProgress'),
  ElResult: passthroughStub('ElResult'),
  ElDatePicker: passthroughStub('ElDatePicker'),
  ElCheckbox: passthroughStub('ElCheckbox'),
  ElCheckboxGroup: passthroughStub('ElCheckboxGroup'),
  ElSwitch: passthroughStub('ElSwitch'),
  ElTooltip: passthroughStub('ElTooltip'),
  ElEmpty: defineComponent({
    name: 'ElEmpty',
    props: { description: String, imageSize: Number },
    setup(props) {
      return () =>
        h('div', { class: 'el-empty-stub' }, props.description ?? '');
    },
  }),
};

/**
 * ElUpload stub that exposes simulateChange/simulateRemove so tests can
 * drive the `on-change`/`on-remove` function props without a real input.
 */
export const ElUploadStub = defineComponent({
  name: 'ElUpload',
  props: {
    onChange: { type: Function, default: null },
    onRemove: { type: Function, default: null },
    autoUpload: Boolean,
    limit: Number,
    accept: String,
  },
  setup(props, { slots, expose }) {
    function simulateChange(file: File) {
      props.onChange?.({
        raw: file,
        name: file.name,
        size: file.size,
      });
    }
    function simulateRemove() {
      props.onRemove?.();
    }
    expose({ simulateChange, simulateRemove });
    return () => h('div', { class: 'el-upload-stub' }, slots.default?.());
  },
});

/** Element Plus message/messagbox mocks. */
export function createElMessageMocks() {
  return {
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
    ElMessageBox: {
      confirm: vi.fn(),
      alert: vi.fn(),
    },
  };
}

/**
 * Build a vue-router mock returning push/replace vi.fns and a route object.
 */
export function createRouterMocks(initial: {
  path?: string;
  query?: Record<string, string>;
  params?: Record<string, string>;
} = {}) {
  const state = {
    path: initial.path ?? '/',
    query: { ...(initial.query ?? {}) },
    params: { ...(initial.params ?? {}) },
    fullPath: initial.path ?? '/',
    meta: {} as Record<string, unknown>,
  };
  const push = vi.fn(async (to: unknown) => {
    if (typeof to === 'string') {
      state.path = to;
      state.fullPath = to;
    } else if (to && typeof to === 'object') {
      const obj = to as Record<string, unknown>;
      if ('path' in obj) {
        state.path = obj.path as string;
        state.fullPath = obj.path as string;
      }
      if ('query' in obj) state.query = { ...(obj.query as Record<string, string>) };
      if ('params' in obj) state.params = { ...(obj.params as Record<string, string>) };
    }
  });
  const replace = vi.fn(async () => undefined);
  return {
    push,
    replace,
    state,
    useRouterMock: () => ({ push, replace }),
    useRouteMock: () => state,
    setRoute(next: Partial<typeof state>) {
      Object.assign(state, next);
    },
  };
}
