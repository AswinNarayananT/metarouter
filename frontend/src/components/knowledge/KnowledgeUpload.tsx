import { useRef } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, Loader2, Upload } from 'lucide-react';
import { MAX_KNOWLEDGE_PDF_BYTES, MAX_KNOWLEDGE_PDF_MB } from '@/utils/knowledge';

interface KnowledgeUploadProps {
  isUploading: boolean;
  disabled: boolean; // Document limit reached
  onUpload: (file: File) => Promise<boolean>; // A failed upload shows as a toast
}

const validationSchema = Yup.object({
  file: Yup.mixed<File>()
    .required('Choose a PDF')
    .test('fileType', 'Only PDF files are allowed', (file) =>
      !file || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )
    .test('fileSize', `PDF must be ${MAX_KNOWLEDGE_PDF_MB} MB or smaller`, (file) => !file || file.size <= MAX_KNOWLEDGE_PDF_BYTES),
});

// Picking a PDF uploads it right away; processing continues in the background
export function KnowledgeUpload({ isUploading, disabled, onUpload }: KnowledgeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const formik = useFormik<{ file: File | null }>({
    initialValues: { file: null },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      if (!values.file) return;
      const uploaded = await onUpload(values.file);
      if (uploaded) resetForm();
      if (inputRef.current) inputRef.current.value = '';
    },
  });

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    await formik.setFieldValue('file', file);
    formik.setFieldTouched('file', true, false);
    formik.submitForm();
  };

  const error = formik.touched.file && formik.errors.file; // Wrong type / too large; server errors are toasts

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="knowledge_file"
        aria-disabled={disabled || isUploading}
        className={`flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border border-dashed text-center transition-colors ${
          disabled || isUploading
            ? 'border-outline/30 bg-surface-container/50 cursor-not-allowed opacity-60'
            : 'border-outline/40 bg-surface hover:bg-surface-container cursor-pointer'
        }`}
      >
        {isUploading ? (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        ) : (
          <Upload className="w-5 h-5 text-on-surface-variant" />
        )}
        <span className="text-sm text-on-surface">
          {isUploading ? 'Uploading…' : disabled ? 'Document limit reached — delete one to upload another' : 'Click to upload a PDF'}
        </span>
        <span className="text-xs text-on-surface-variant">PDF with selectable text, up to {MAX_KNOWLEDGE_PDF_MB} MB</span>
      </label>
      <input
        ref={inputRef}
        id="knowledge_file"
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleChange}
        disabled={disabled || isUploading}
        className="sr-only"
      />
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-error">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
