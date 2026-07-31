'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Protected from '../../components/Protected';
import { useAuth } from '../../components/AuthProvider';

export default function UploadPage() {
  return (
    <Protected roles={['organization', 'admin']}>
      <UploadInner />
    </Protected>
  );
}

function UploadInner() {
  const { authFetch } = useAuth();
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const router = useRouter();

  function addFiles(fileList) {
    const arr = Array.from(fileList).filter((f) =>
      ['application/pdf', 'image/png', 'image/jpeg'].includes(f.type)
    );
    setFiles((prev) => [...prev, ...arr]);
  }

  async function handleUploadAll() {
    setUploading(true);
    setError('');
    const newResults = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await authFetch('/api/documents/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        newResults.push({ file: file.name, ok: true, doc: data.document });
      } catch (err) {
        newResults.push({ file: file.name, ok: false, error: err.message });
      }
    }
    setResults(newResults);
    setFiles([]);
    setUploading(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload documents</h1>
        <p className="text-muted text-sm mt-1">PDF, PNG, or JPG — up to 20MB each. Each file runs the full verification pipeline: OCR → classification → forgery & metadata analysis → duplicate check → ledger sealing → trust scoring.</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`card p-10 text-center cursor-pointer transition-colors ${dragging ? 'border-accent bg-accent/5' : ''}`}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <p className="font-medium">Drag & drop files here, or click to browse</p>
        <p className="text-muted text-sm mt-1">Bulk upload supported</p>
      </div>

      {files.length > 0 && (
        <div className="card p-4 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate">{f.name}</span>
              <button className="text-muted hover:text-bad" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button className="btn-primary w-full mt-2" onClick={handleUploadAll} disabled={uploading}>
            {uploading ? 'Processing…' : `Verify ${files.length} document${files.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {error && <div className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">{error}</div>}

      {results.length > 0 && (
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">Results</h2>
          {results.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg border border-line">
              <span className="truncate">{r.file}</span>
              {r.ok ? (
                <button className="text-accent" onClick={() => router.push(`/documents/${r.doc.id}`)}>
                  View result ({r.doc.trustScore}/100) →
                </button>
              ) : (
                <span className="text-bad">{r.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
