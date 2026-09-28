export const maskPhone = (v: string) => v.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
export const maskId = (v: string) =>
  v.length <= 8
    ? '*'.repeat(Math.max(0, v.length - 4)) + v.slice(-4)
    : v.slice(0, 3) + '********' + v.slice(-4);
