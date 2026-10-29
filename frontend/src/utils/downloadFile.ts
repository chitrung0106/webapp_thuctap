export function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Keep the URL alive until the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}