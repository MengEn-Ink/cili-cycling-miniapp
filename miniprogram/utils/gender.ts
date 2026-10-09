export type GenderValue = '男' | '女';

export function normalizeGender(value: unknown): GenderValue | '' {
  return value === '男' || value === '女' ? value : '';
}

export interface GenderView {
  gender: GenderValue | '';
  genderLabel: string;
  genderClass: string;
}

export function genderView(value: unknown): GenderView {
  const gender = normalizeGender(value);
  return {
    gender,
    genderLabel: gender || '未标注',
    genderClass:
      gender === '男' ? 'gender-male' : gender === '女' ? 'gender-female' : 'gender-unknown',
  };
}
