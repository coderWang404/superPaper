export type Segmentation = Record<
  string,
  string | number | boolean | undefined | unknown | any
>

export function send(
  _category: string,
  _action: string,
  _label?: string,
  _value?: string
) {}

export function sendOnce(
  _category: string,
  _action: string,
  _label: string,
  _value: string
) {}

export function sendMB(_key: string, _segmentation: Segmentation = {}) {}

export function sendMBOnce(_key: string, _segmentation: Segmentation = {}) {}

export function sendMBSampled(
  _key: string,
  _segmentation: Segmentation = {},
  _rate = 0.01
) {}

export function sendMBOncePerPageLoad(
  _key: string,
  _segmentation: Segmentation = {}
) {}

// Use breakpoint @screen-xs-max from less:
// @screen-xs-max: (@screen-sm-min - 1);
// @screen-sm-min: @screen-sm;
// @screen-sm: 768px;
export const isSmallDevice = window.screen.width < 768
