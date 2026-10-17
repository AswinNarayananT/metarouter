import * as Yup from 'yup';
import type { FormikErrors, FormikTouched } from 'formik';

/* ---------- Reusable field schemas ---------- */

// Password policy shown in the UI; the backend enforces the same rules.
export const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'One number', test: (v) => /\d/.test(v) },
];

export const emailField = (label = 'Email') =>
  Yup.string().trim().email('Enter a valid email address').required(`${label} is required`);

export const nameField = (label = 'Name') =>
  Yup.string()
    .trim()
    .required(`${label} is required`)
    .min(2, `${label} must be at least 2 characters`)
    .max(120, `${label} must be 120 characters or less`);

export const strongPasswordField = (label = 'Password') =>
  Yup.string()
    .required(`${label} is required`)
    .min(8, `${label} must be at least 8 characters`)
    .max(128, `${label} must be 128 characters or less`)
    .matches(/[A-Z]/, `${label} must contain an uppercase letter`)
    .matches(/[a-z]/, `${label} must contain a lowercase letter`)
    .matches(/\d/, `${label} must contain a number`);

export const confirmPasswordField = (ref: string) =>
  Yup.string()
    .required('Please confirm your password')
    .oneOf([Yup.ref(ref)], 'Passwords do not match');

/* ---------- Formik helpers ---------- */

/** Returns the error for a field only once the user has touched it (or tried to submit). */
export function fieldError<T>(
  formik: { errors: FormikErrors<T>; touched: FormikTouched<T> },
  name: keyof T & string
): string | undefined {
  const error = formik.errors[name];
  return formik.touched[name] && typeof error === 'string' ? error : undefined;
}
