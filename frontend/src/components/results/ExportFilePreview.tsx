import { useState } from "react";
import type { ExportFile, ExportPreview } from "../../types/export";
import { formatBytes } from "../../utils/formatBytes";

interface TreeNode { folders: Map<string, TreeNode>; files: ExportFile[]; }
function buildTree(files: ExportFile[]) {
  const root: TreeNode = { folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/"); let node = root;
    for (const part of parts.slice(0, -1)) { if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [] }); node = node.folders.get(part)!; }
    node.files.push(file);
  }
  return root;
}

export default function ExportFilePreview({ preview }: { preview: ExportPreview }) {
  const [path, setPath] = useState("README.txt");
  const file = preview.files.find((item) => item.path === path) ?? preview.files[0];
  function tree(node: TreeNode) {
    return <>{node.files.map((item) => <button key={item.path} type="button" className={item.path === file?.path ? "is-selected" : ""} onClick={() => setPath(item.path)} aria-current={item.path === file?.path ? "true" : undefined} title={item.path}><span>{item.kind === "binary" ? "▣" : "▤"}</span>{item.path.split("/").at(-1)}</button>)}{[...node.folders].map(([name, child]) => <details key={name} open><summary>▸ {name}/</summary><div className="export-tree-children">{tree(child)}</div></details>)}</>;
  }
  if (!file) return null;
  return <section className="export-source-preview" aria-labelledby="export-source-title"><div className="export-source-heading"><div><h3 id="export-source-title">Xem trước các file tải về</h3><p>{preview.files.length} file · {formatBytes(preview.totalBytes)} trước nén · {preview.fileName}</p></div><span>CHỈ XEM</span></div><div className="export-source-layout"><nav className="export-file-tree" aria-label="Cây file gói export">{tree(buildTree(preview.files))}</nav><div className="export-file-view"><div className="export-file-title"><strong>{file.path}</strong><span>{formatBytes(file.bytes)}</span></div>{file.kind === "binary" ? <div className="export-binary-preview"><h4>File model nhị phân</h4><p>File này không hiển thị dưới dạng code. Tải gói để dùng cùng chương trình và README đi kèm.</p><dl><dt>Kích thước</dt><dd>{formatBytes(file.bytes)}</dd><dt>SHA-256</dt><dd>{file.sha256}</dd></dl></div> : <><pre tabIndex={0} className="export-code-view" aria-label={`Nội dung ${file.path}`}>{file.content || (file.bytes === 0 ? "File này đang trống." : "Nội dung chưa được hiển thị do giới hạn bản xem trước. Tải gói để xem đầy đủ file.")}</pre>{file.truncated && Boolean(file.content) && <p className="dataset-local-note export-preview-truncated">Đang hiển thị một phần để giữ giao diện nhẹ. File tải về vẫn đầy đủ nội dung.</p>}</>}<p className="export-file-checksum">SHA-256: {file.sha256}</p></div></div></section>;
}

