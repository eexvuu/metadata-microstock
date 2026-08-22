import type { Messages } from './en'

/**
 * Bahasa Indonesia.
 *
 * Typed as `Messages`, so this file cannot drift from `en.tsx` — add a key
 * there and the build fails here until it is translated. The register is
 * "Anda" throughout, and product nouns stay as they are: Stockflow, Gemma,
 * Gemini, Adobe Stock, Shutterstock, CSV, BOM, run.
 */
export const id: Messages = {
  nav: {
    overview: 'Ringkasan',
    tools: 'Perkakas',
    history: 'Riwayat',
    catalog: 'Katalog',
    metadata: 'Metadata',
    monitoring: 'Pemantauan',
  },

  header: {
    signIn: 'Masuk',
    start: 'Mulai',
    accountMenu: 'Menu akun',
    signOut: 'Keluar',
    language: 'Bahasa',
    theme: 'Tema',
    themeModes: { light: 'terang', dark: 'gelap', auto: 'otomatis' },
  },

  footer: {
    blurb: (
      <>
        Perkakas untuk orang-orang yang mengunggah ke microstock. File Anda tetap
        di komputer Anda; modelnya berjalan dengan{' '}
        <span className="text-primary font-mono">kunci Anda sendiri</span>.
      </>
    ),
    stamp: 'Gemma · kunci Anda · komputer Anda',
  },

  landing: {
    eyebrow: 'Stockflow · perkakas pertama, gratis selamanya',
    headline: (
      <>
        Metadata stok untuk{' '}
        <em className="text-primary font-normal italic">satu folder penuh</em>,
        sekali jalan.
      </>
    ),
    lead: 'Stockflow adalah kumpulan perkakas untuk orang yang mengunggah ke microstock. Yang pertama menulis judul, 49 kata kunci dan kategori yang tepat untuk setiap gambar dan video dalam satu folder, langsung ke CSV yang diminta Adobe Stock dan Shutterstock — memakai model Gemma gratis dari Google dan kunci API Anda sendiri.',
    ctaPrimary: 'Buat akun gratis',
    ctaSecondary: 'Masuk',
    stats: [
      'kata kunci per berkas',
      'permintaan gratis per kunci',
      'byte media yang diunggah',
    ],
    sheetStatus: 'memproses',
    sheetFooter: '6 / 6 berkas · 291 kata kunci',

    catalogTitle: 'Isi rak',
    catalogLead:
      'Satu akun, satu set kunci, dan satu perkakas untuk tiap pekerjaan. Semua yang diketahui sebuah perkakas tentang file Anda tetap berada di tab tempat ia berjalan.',
    catalogFree: 'gratis',
    catalogPlanned: 'direncanakan',
    catalogMetadata:
      'Masukkan satu folder gambar dan video, keluar CSV Adobe Stock atau Shutterstock. Bisa dilanjutkan, mendukung banyak kunci, dan gratis selama tier gratis Google masih ada.',
    catalogMetadataCta: 'Mulai dari sini',
    catalogNextTitle: 'Perkakas berikutnya',
    catalogNext:
      'Masih banyak bagian rutinitas unggah yang layak ada di sini. Apa pun yang datang berikutnya memakai akun yang sama, kunci yang sama, dan aturan yang sama: file Anda tidak pernah sampai ke server kami.',

    processTitle: 'Cara kerjanya',
    steps: [
      {
        title: 'Buat akun',
        body: 'Gratis, tanpa kartu, dan tidak ada yang perlu diatur sebelum run pertama.',
      },
      {
        title: 'Tambahkan kunci Gemini Anda',
        body: 'Tempel sekali, diverifikasi ke Google, lalu dienkripsi di akun Anda.',
      },
      {
        title: 'Seret foto Anda ke sini',
        body: 'Periksa judul dan kata kunci yang ditulis, perbaiki sesuka Anda, lalu ambil CSV-nya.',
      },
    ],

    specimenTitle: 'Yang muncul di folder',
    specimenLead:
      'Satu CSV, persis sampai ke bytenya seperti yang diterima tiap platform — BOM-nya, tanda kutipnya, akhir barisnya. Langsung masukkan ke antrean unggah tanpa perlu membuka spreadsheet.',

    featuresTitle: 'Yang Anda dapat',
    features: [
      {
        title: 'Satu folder sekaligus',
        body: 'Seret satu folder berisi gambar dan video. Tiap berkas dianalisa dan CSV-nya muncul di samping file Anda, siap diunggah.',
      },
      {
        title: 'Adobe dan Shutterstock',
        body: 'Tiap platform punya prompt sendiri, batas kata kunci sendiri, dan bentuk CSV yang persis — BOM di tempat Adobe memintanya, nama kategori di tempat Shutterstock memintanya.',
      },
      {
        title: 'Kunci Anda, kuota Anda',
        body: 'Pakai kunci Gemini gratis milik Anda sendiri. Tiap kunci menambah sekitar 15 permintaan per menit, dan pekerjaannya dibagi ke semuanya.',
      },
      {
        title: 'Keputusan akhir ada di Anda',
        body: 'Tidak ada yang ditulis sebelum Anda setuju: tiap judul, kata kunci dan kategori bisa diubah tepat di sebelah gambarnya, dan baru setelah itu CSV dibuat.',
      },
      {
        title: 'File tidak pernah keluar dari komputer Anda',
        body: 'Analisanya berjalan di browser Anda dan berbicara langsung ke Google. Foto dan video Anda tidak pernah diunggah ke kami — kami bahkan tidak punya tempat untuk menyimpannya.',
      },
      {
        title: 'Unggah vektor tanpa ribet',
        body: 'Unggah JPEG atau SVG hasil ekspor Anda, lalu tentukan nama berkas yang harus dibawa CSV — .eps, .ai, apa pun — untuk satu baris atau untuk semuanya sekaligus.',
      },
    ],

    closeHeadline: (
      <>
        Berhenti menulis kata kunci{' '}
        <em className="text-primary font-normal italic">satu per satu</em>.
      </>
    ),
    closeLead:
      'Tambahkan kunci Anda sekali, dan tiap batch unggahan setelahnya cukup satu klik sambil ngopi.',
    closeCta: 'Mulai sekarang',
  },

  catalog: {
    index: 'Katalog',
    title: 'Perkakas Anda',
    lead: 'Semua di sini berjalan dengan kunci Gemini Anda sendiri, di browser Anda sendiri. Perkakas metadata gratis dan akan selalu gratis — yang berbayar akan menyebutkannya di kartunya.',
    free: 'gratis',
    planned: 'direncanakan',
    metadataBody:
      'Judul, 49 kata kunci dan kategori yang tepat untuk satu folder penuh gambar dan video, ditulis ke CSV yang diminta Adobe Stock dan Shutterstock.',
    statRuns: 'run',
    statFiles: 'berkas',
    statKeys: 'kunci',
    open: 'Buka perkakas',
    needKey: 'tambahkan kunci Gemini gratis di dalam perkakas',
    nextTitle: 'Perkakas berikutnya',
    nextBody: (
      <>
        Rak ini dibuat untuk menampung lebih dari satu hal. Perkakas baru berarti
        satu folder di bawah <code className="font-mono text-xs">src/lib/</code>{' '}
        dan satu kartu di sini — akun, kunci dan riwayat run-nya sudah dipakai
        bersama.
      </>
    ),
    lastRun: 'Run terakhir',
    fullHistory: 'Riwayat lengkap',
    files: (done: number, total: number) => `${done}/${total} berkas`,
  },

  history: {
    index: 'Akun',
    title: 'Riwayat',
    empty:
      'Belum ada — tambahkan kunci Gemini lalu arahkan perkakas metadata ke sebuah folder.',
    summary: (files: number, runs: number) =>
      `${files} berkas dari ${runs} run terakhir Anda, dilaporkan oleh browser yang mengerjakannya.`,
    noRuns: 'belum ada run tercatat',
    openTool: 'Buka perkakas metadata',
    columns: {
      folder: 'Folder',
      platform: 'Platform',
      files: 'Berkas',
      status: 'Status',
      started: 'Dimulai',
      result: 'Hasil',
    },
    fallbacks: (count: number) => `(${count} fallback)`,

    open: 'Buka',
    expired: 'kedaluwarsa',
    expiresIn: (days: number) =>
      days <= 0 ? 'hilang hari ini' : `sisa ${days} hari`,
    resultsNote:
      'Run yang selesai menyimpan barisnya selama tujuh hari, jadi Anda bisa membukanya lagi, membetulkan judul, dan mengambil CSV baru. Setelah itu yang tersisa hanya angka di atas.',

    resultTitle: 'Hasil tersimpan',
    resultGone: 'Hasil ini sudah kedaluwarsa.',
    resultGoneBody:
      'Baris disimpan tujuh hari setelah run. Run-nya sendiri masih ada di riwayat Anda — yang hilang hanya hasil yang bisa diedit.',
    backToHistory: 'Kembali ke riwayat',
    resultSaved: 'Tersimpan',
    resultSaveFailed: 'Tidak bisa menyimpan perubahan itu.',
    save: 'Simpan perubahan',
    saving: 'Menyimpan…',
    noThumbnails:
      'Tidak ada pratinjau di sini — file-nya ada di komputer Anda sendiri, dan halaman ini memang tidak pernah memilikinya.',
  },

  auth: {
    email: 'Email',
    password: 'Kata sandi',
    name: 'Nama',
    namePlaceholder: 'Ada Lovelace',
    emailPlaceholder: 'anda@perusahaan.com',

    signInTitle: 'Masuk',
    signInDescription:
      'Selamat datang kembali. Gunakan akun yang Anda daftarkan.',
    signInSubmit: 'Masuk',
    signInPending: 'Sedang masuk…',
    signInFailed: 'Tidak bisa masuk.',
    needAccount: 'Belum punya akun?',
    signUpLink: 'Daftar',

    signUpTitle: 'Buat akun',
    signUpDescription:
      'Satu akun untuk semua perkakas di rak. Tanpa kartu, tanpa masa coba.',
    signUpSubmit: 'Buat akun',
    signUpPending: 'Membuat…',
    signUpFailed: 'Tidak bisa membuat akun.',
    passwordHint: 'Minimal 8 karakter.',
    haveAccount: 'Sudah punya akun?',
    signInLink: 'Masuk',
  },

  tool: {
    keysButton: 'Kunci',
    keySummary: (keys: number, parallel: number) =>
      `${keys} kunci · ${parallel} paralel`,

    step1: 'Langkah 1 · File Anda',
    step2: 'Langkah 2 · Tempat unggah',
    step3: 'Langkah 3 · Jalankan',
    stepReview: 'Langkah 3 · Periksa',
    stepUnfinished: 'Langkah 3 · Belum selesai',

    partialNote: (done: number, total: number) =>
      `${done} dari ${total} berkas selesai sebelum kuota kunci habis. Jalankan lagi — akan dilanjutkan dari tempat berhentinya — dan CSV ditulis setelah semua berkas beres.`,
    exportedNote: (csvName: string) =>
      `${csvName} sudah jadi. Ubah dan ekspor lagi kalau Anda berubah pikiran.`,
    reviewNote:
      'Belum ada apa pun yang ditulis. Perbaiki yang kurang pas, lalu ekspor.',
    continueRun: 'Lanjutkan run',
    startOver: 'Mulai ulang',

    scanning: 'membaca folder…',
    counts: (files: number, images: number, videos: number) =>
      `${files} berkas · ${images} gambar · ${videos} video`,
    unreadable: (names: string) =>
      `${names} tidak bisa dibuka — file .ai hanya terbaca kalau disimpan dengan "Create PDF Compatible File" dicentang. Simpan ulang, atau ekspor jadi JPEG.`,
    skipped: (names: string, extension: string) =>
      `${names} dilewati — perkakas ini tidak bisa membukanya. Ekspor jadi JPEG, PNG atau MP4 lalu masukkan yang itu; nama baris CSV-nya tetap bisa Anda buat ${extension} di layar periksa.`,
    nothingReadable:
      'Tidak ada yang bisa dibaca di sana. Format yang bisa dibuka: JPG, PNG, WEBP, SVG, AI, PDF, MP4, MOV dan M4V.',

    adobeDetail: 'Judul, 49 kata kunci, satu nomor kategori.',
    shutterstockDetail: 'Deskripsi, 49 kata kunci, sampai dua nama kategori.',

    working: 'Sedang bekerja…',
    writeMetadata: 'Tulis metadata saya',
    stop: 'Berhenti',
    needKeyFirst: 'tambahkan kunci Gemini dulu — cuma sebentar dan gratis',
    needMediaFirst: 'masukkan foto di atas untuk mulai',
    progress: (done: number, total: number) => `${done} / ${total} berkas`,

    keysInRotation: 'Kunci yang dirotasi',
    manage: 'Kelola',
    rotationNote:
      'Tiap kunci bekerja sekitar 15 permintaan per menit. Kunci yang kena limit istirahat sebentar sementara yang lain lanjut, jadi makin banyak kunci makin cepat.',

    csvWritten: (csvName: string) => `${csvName} ditulis di samping file Anda`,
    csvDownloaded: (csvName: string) => `${csvName} diunduh`,
  },

  picker: {
    title: 'Seret folder foto ke sini',
    body: 'Foto, video, SVG, dan file Illustrator — tidak ada yang diunggah ke kami. Halaman ini membacanya dari disk Anda dan mengirim satu per satu langsung ke Google dengan kunci Anda sendiri.',
    chooseFolder: 'Pilih folder',
    chooseFiles: 'Pilih file',
    noFolderSupport:
      'browser ini tidak bisa membuka folder — Chrome atau Edge bisa, dan CSV-nya akan ditulis di samping file Anda, bukan diunduh',
    nothingUsable: 'Tidak ada yang bisa dipakai dari situ — hanya gambar dan video.',
    fileCount: (files: number) => `${files} berkas`,
    folderMode: 'folder · CSV ditulis balik, run bisa dilanjutkan kalau terputus',
    filesMode: 'file · CSV diunduh, tidak bisa dilanjutkan',
    clear: 'Hapus',
    videoBadge: 'video',
    more: (rest: number) => `+ ${rest} berkas lagi dalam antrean`,
  },

  keys: {
    railEmpty: 'belum ada kunci aktif — tambahkan di atas',
    keyN: (index: number) => `kunci ${index}`,
    filesDone: (files: number) => `${files} berkas`,
    idle: 'diam',
    ready: 'siap',
    busy: 'bekerja',
    outOfQuota: 'kuota habis',
    cooling: (seconds: number) => `istirahat ${seconds}d`,

    dialogTitle: 'Kunci Gemini Anda',
    dialogDescription: (
      <>
        Gratis dari{' '}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          aistudio.google.com/apikey
        </a>
        . Tiap kunci menambah sekitar 15 permintaan per menit, jadi dua kunci
        dua kali lebih cepat. Kunci dienkripsi sebelum disimpan. Kunci utuh
        keluar dari server kami saat tab ini membutuhkannya untuk memanggil
        Google — dan kalau Anda minta bantuan, admin bisa membukanya untuk
        menelusuri masalahnya. Tiap pembukaan tercatat atas nama admin itu.
      </>
    ),
    labelOptional: 'Label (opsional)',
    labelPlaceholder: 'Akun pribadi',
    addAndVerify: 'Tambah dan verifikasi',
    pasteHint: (
      <>
        Satu per baris — tempel{' '}
        <code className="border-(--line) text-foreground border px-1 font-mono text-[0.7rem]">
          gemini-key.txt
        </code>{' '}
        Anda apa adanya, komentar dan baris kosong sekalian. Tiap kunci dicek ke
        Google sebelum disimpan.
      </>
    ),
    added: (count: number) => `${count} kunci ditambahkan`,
    removed: (preview: string) => `${preview} dihapus`,
    removeAria: (preview: string) => `Hapus ${preview}`,
    columnLabel: 'Label',
    columnKey: 'Kunci',
    columnStatus: 'Status',
    columnLastUsed: 'Terakhir dipakai',
    columnActions: 'Aksi',
    never: 'belum pernah',
    enable: 'Aktifkan',
    disable: 'Nonaktifkan',
    status: { active: 'aktif', disabled: 'nonaktif' },
    empty: 'belum ada kunci — tempel satu di atas dan perkakas siap dipakai',
    firstBody:
      'Perkakas ini berjalan dengan kunci Google milik Anda sendiri, gratis dan cuma perlu semenit untuk membuatnya. Tidak perlu yang lain.',
    firstCta: 'Tambahkan kunci Gemini Anda',
  },

  options: {
    heading: 'Kolom Shutterstock',
    changedAria: 'berbeda dari bawaan',
    illustration: 'Kolom illustration',
    illustrationAuto: 'Otomatis — model yang menentukan',
    illustrationYes: 'Paksa yes',
    illustrationNo: 'Paksa no',
    editorial: 'Editorial = yes',
    mature: 'Mature content = yes',
  },

  review: {
    logHeading: 'Log run',
    rowsReady: 'baris siap',
    needLook: (count: number) => `${count} perlu dicek`,
    filterPlaceholder: 'Saring baris…',
    bulkKeywordPlaceholder: 'Kata kunci untuk semua baris',
    addToAllAria: 'Tambahkan ke semua baris',
    extensionAria: 'Ekstensi untuk semua baris',
    extensionPlaceholder: 'Ekstensi untuk semua baris…',
    renameEvery: (extension: string) => `ubah semua baris jadi ${extension}`,
    writeCsv: 'Tulis CSV ke folder',
    downloadCsv: 'Unduh CSV',
    fallbackNote: (model: string) =>
      `fallback ${model} — tulis manual atau jalankan ulang`,
    filenameInCsv: 'Nama berkas di CSV',
    onDisk: (name: string) => `di disk: ${name}`,
    titleLabel: 'Judul',
    descriptionLabel: 'Deskripsi',
    chars: (count: number) => `${count} karakter`,
    keywords: 'Kata kunci',
    keywordPlaceholder: '+ kata kunci',
    category: 'Kategori',
    categories: 'Kategori',
    noMatch: 'tidak ada yang cocok dengan saringan itu',
    issues: {
      noFilename: 'nama berkas kosong',
      badFilename: 'nama berkas mengandung garis miring atau ganti baris',
      noTitle: 'judul masih kosong',
      noKeywords: 'belum ada kata kunci',
      overLimit: (over: number) => `${over} kata kunci melebihi batas`,
      adobeComma: 'judul Adobe tidak boleh mengandung koma atau tanda kutip',
      noCategory: 'kategori kosong',
    },
  },

  log: {
    cancelled: 'Dibatalkan — progres tersimpan, jalankan lagi untuk melanjutkan.',
    noKeys: 'Tidak ada kunci API aktif di akun ini — tambahkan lewat menu Kunci.',
    scanned: (total: number, images: number, videos: number, skipped: number) =>
      `${total} berkas media (${images} gambar, ${videos} video); ${skipped} berkas lain diabaikan`,
    fileFailed: (name: string, message: string, requeued: boolean) =>
      `${name}: ${message}${requeued ? ' — dicoba ulang' : ' — pakai baris cadangan'}`,
    keyCooldown: (index: number, consecutive: number) =>
      `Kunci ${index} kena limit (429) — istirahat 60 detik (${consecutive}/5)`,
    keyDead: (index: number) => `Kunci ${index} kuotanya habis untuk hari ini`,
    modelFallback: (name: string, model: string) =>
      `${name}: mencoba ulang dengan ${model}`,
    partial: (done: number, total: number, remaining: number) =>
      `Run sebagian: ${done}/${total} selesai, ${remaining} tersisa. Belum ada CSV — jalankan lagi untuk melanjutkan.`,
    finished: (csvName: string, rows: number) =>
      `${csvName} ditulis (${rows} baris)`,
  },
}
