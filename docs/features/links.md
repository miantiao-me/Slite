# Links

Use `/dashboard` to create and manage short links. Choose a destination and short code, then copy the resulting URL or QR code.

Link settings include expiration, passwords, tags, comments, device routing (separate Apple and Android destinations), and social previews. Verify routing with representative requests before publishing. Uploaded preview images are stored through the unstorage filesystem driver under `/data/files/images`; preserve this directory when moving or backing up the instance.

SQLite is the authoritative store. Use [import/export](/features/import-export) to transfer existing records.
