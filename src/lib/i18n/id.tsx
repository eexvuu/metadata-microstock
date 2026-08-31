import type { Messages } from './en'

/**
 * Bahasa Indonesia.
 *
 * Typed as `Messages`, so this file cannot drift from `en.tsx` — add a key
 * there and the build fails here until it is translated. The register is
 * "Anda" throughout, and product nouns stay as they are: Stockflow,
 * Gemini, Adobe Stock, Shutterstock, CSV, BOM, run.
 */
export const id: Messages = {
  nav: {
    overview: 'Ringkasan',
    tools: 'Perkakas',
    catalog: 'Katalog',
    metadata: 'Metadata',
    vectorizer: 'Vectorizer',
    platform: 'Platform',
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
    stamp: 'Model Google · kunci Anda · komputer Anda',
  },

  landing: {
    eyebrow: 'Stockflow · satu rak perkakas, gratis hari ini',
    headline: (
      <>
        Rutinitas unggah,{' '}
        <em className="text-primary font-normal italic">satu perkakas
        sekali jalan</em>
        .
      </>
    ),
    lead: 'Stockflow adalah rak berisi perkakas kecil untuk orang yang mengunggah ke microstock. Satu akun, satu set kunci API Google milik Anda sendiri, dan ruang tersendiri untuk tiap pekerjaan. Perkakas pertama menulis CSV metadata untuk satu folder penuh; yang berikutnya mengambil sisa rutinitasnya.',
    ctaPrimary: 'Buat akun gratis',
    ctaSecondary: 'Masuk',
    ctaDashboard: 'Buka dasbor Anda',
    stats: [
      'kontributor sudah punya akun',
      'berkas sudah dibuatkan metadata',
      'pekerjaan berjalan di browser Anda sendiri',
    ],
    sheetTool: 'perkakas 01 · metadata',
    sheetStatus: 'memproses',
    sheetFooter: '6 / 6 berkas · 291 kata kunci',

    catalogTitle: 'Di rak ini',
    catalogLead:
      'Satu perkakas untuk satu pekerjaan, dan tidak ada yang dibagi di antara mereka selain akun dan kunci Anda. Buka salah satu, maka run, riwayat dan pengaturannya tinggal di dalamnya — supaya rak ini bisa bertambah tanpa saling mengganggu.',
    catalogFree: 'gratis',
    catalogPlanned: 'direncanakan',
    catalogMetadata:
      'Satu folder gambar dan video masuk, CSV Adobe Stock atau Shutterstock keluar. Bisa dilanjutkan, multi-kunci, dan gratis selama kuota gratis Google masih ada.',
    catalogMetadataCta: 'Mulai dari yang ini',
    catalogMetadataOpen: 'Buka perkakas',
    catalogNextTitle: 'Perkakas berikutnya',
    catalogNext:
      'Masih banyak bagian rutinitas unggah yang pantas ada di sini. Apa pun yang datang berikutnya memakai akun dan kunci yang sama, dan tunduk pada tiga aturan di bawah.',

    rulesTitle: 'Tiga aturan rumah',
    rulesLead:
      'Tiga hal ini berlaku untuk setiap perkakas di rak ini, dan akan tetap berlaku untuk yang belum ditulis.',
    rules: [
      {
        title: 'File Anda tidak pernah sampai ke kami',
        body: 'Pekerjaannya berjalan di browser Anda dan berbicara langsung ke Google. Foto dan footage Anda tidak pernah diunggah ke kami — tempat untuk menyimpannya pun kami tidak punya.',
      },
      {
        title: 'Kunci Anda, kuota Anda',
        body: 'Pakai kunci API Google gratis milik Anda sendiri. Kuncinya dienkripsi di akun Anda, hanya Anda yang memakainya, dan semua perkakas di rak ini mengambil dari set yang sama.',
      },
      {
        title: 'Tidak ada yang final sebelum Anda setuju',
        body: 'Perkakasnya mengusulkan, Anda yang memutuskan. Apa pun hasilnya bisa Anda ubah sebelum ditulis, dan pekerjaan yang sudah selesai masih bisa dibuka lagi selama seminggu.',
      },
    ],

    firstToolTitle: 'Perkakas pertama: metadata',
    firstToolLead:
      'Judul, 49 kata kunci dan kategori yang tepat untuk setiap gambar dan video dalam satu folder, langsung ke CSV yang diminta Adobe Stock dan Shutterstock.',

    specimenTitle: 'Yang mendarat di folder Anda',
    specimenLead:
      'Satu CSV, persis sesuai bentuk yang diterima tiap platform — BOM-nya, tanda kutipnya, akhir barisnya. Langsung masukkan ke antrean unggah tanpa perlu membuka spreadsheet.',

    featuresTitle: 'Apa yang dikerjakannya',
    features: [
      {
        title: 'Satu folder penuh sekali jalan',
        body: 'Seret satu folder berisi gambar dan video. Setiap berkas dianalisis dan CSV-nya mendarat kembali di samping file Anda, siap diunggah.',
      },
      {
        title: 'Adobe dan Shutterstock',
        body: 'Tiap platform punya prompt sendiri, batas kata kunci sendiri dan bentuk CSV yang persis — BOM di tempat Adobe memintanya, nama kategori di tempat Shutterstock memintanya.',
      },
      {
        title: 'Unggahan vektor, tanpa ribet',
        body: 'Unggah JPEG atau SVG hasil ekspor Anda, lalu tentukan nama berkas yang dibawa CSV — .eps, .ai, .mp4, apa saja — untuk satu baris atau semua baris sekaligus.',
      },
      {
        title: 'Seminggu untuk berubah pikiran',
        body: 'Setiap run yang selesai masih bisa dibuka selama tujuh hari: perbaiki judul, tambah kata kunci, ambil CSV baru. Setelah itu tinggal angkanya saja.',
      },
    ],

    processTitle: 'Cara kerjanya',
    steps: [
      {
        title: 'Buat akun',
        body: 'Gratis, tanpa kartu, dan tidak ada yang perlu disetel sebelum run pertama.',
      },
      {
        title: 'Tambahkan kunci Google Anda',
        body: 'Ditempel sekali, diverifikasi ke Google, lalu dienkripsi di akun Anda — dan semua perkakas di rak ini bisa memakainya.',
      },
      {
        title: 'Buka perkakasnya, lalu kerjakan',
        body: 'Hari ini itu berarti perkakas metadata: seret folder Anda, periksa hasil tulisannya, ambil CSV-nya.',
      },
    ],

    closeHeadline: (
      <>
        Singkirkan separuh membosankan dari proses unggah{' '}
        <em className="text-primary font-normal italic">dari meja Anda</em>.
      </>
    ),
    closeLead:
      'Tambahkan kunci Anda sekali saja. Setiap perkakas yang mendarat di rak ini setelah itu sudah siap pakai dan sudah gratis.',
    closeCta: 'Mulai sekarang',
  },
  catalog: {
    index: 'Katalog',
    title: 'Perkakas Anda',
    lead: 'Satu akun, satu set kunci, dan ruang sendiri untuk tiap perkakas. Buka salah satu dan bekerjalah di dalamnya — run, riwayat dan pengaturannya tinggal di situ.',
    free: 'gratis',
    trial: 'coba gratis',
    adminOnly: 'khusus admin',
    comingSoon: 'segera hadir',
    planned: 'direncanakan',
    vectorizerBody:
      'Gambar raster ditelusuri menjadi SVG dan EPS 4000 px, satu batch sekali jalan, dengan pengaturan yang diterima Shutterstock dan Adobe Stock. Berjalan dengan token, bukan dengan kunci Anda sendiri, dan tiap akun baru dapat beberapa token untuk mencoba.',
    metadataBody:
      'Judul, 49 kata kunci dan kategori yang tepat untuk satu folder penuh gambar dan video, ditulis ke CSV yang diminta Adobe Stock dan Shutterstock.',
    open: 'Buka',
    notYet: 'belum dibuka',
    needKey: 'perlu kunci Gemini gratis',
    nextTitle: 'Perkakas berikutnya',
    nextBody: (
      <>
        Rak ini dibuat untuk menampung lebih dari satu hal. Perkakas baru berarti
        satu folder di bawah <code className="font-mono text-xs">src/lib/</code>{' '}
        dan satu kartu di sini — akun dan kuncinya sudah dipakai bersama. Run dan
        riwayatnya tinggal di ruangnya sendiri.
      </>
    ),
  },

  history: {
    index: 'Metadata',
    title: 'Riwayat',
    empty:
      'Belum ada — tambahkan kunci Gemini lalu arahkan perkakas metadata ke sebuah folder.',
    summary: (files: number, runs: number) =>
      `${files} berkas dari ${runs} run terakhir Anda, dilaporkan oleh browser yang mengerjakannya.`,
    noRuns: 'belum ada run tercatat',
    openTool: 'Mulai satu run',
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
      'Run yang selesai menyimpan barisnya selama tujuh hari, jadi Anda bisa membukanya lagi, membetulkan judul, dan mengambil CSV baru. Setelah itu yang tersisa hanya angka di atas. Selama hasilnya masih ada, admin juga bisa membukanya kalau Anda minta bantuan soal hasil itu — dan tiap pembukaan tercatat atas nama admin tersebut.',

    resultTitle: 'Hasil tersimpan',
    resultGone: 'Hasil ini sudah kedaluwarsa.',
    resultGoneBody:
      'Baris disimpan tujuh hari setelah run. Run-nya sendiri masih ada di riwayat Anda — yang hilang hanya hasil yang bisa diedit.',
    backToHistory: 'Kembali ke riwayat',
    resultSaved: 'Tersimpan',
    resultSaveFailed: 'Tidak bisa menyimpan perubahan itu.',
    save: 'Simpan perubahan',
    saving: 'Menyimpan…',
    previewsMissing:
      'Tidak ada pratinjau di browser ini — gambar kecilnya disimpan di komputer yang menjalankan run-nya, tidak pernah di server kami, jadi hanya muncul di sana.',
  },

  auth: {
    signInTitle: 'Masuk',
    signInDescription:
      'Satu akun untuk semua perkakas di rak. Tanpa kartu, tanpa masa coba.',
    google: 'Lanjut dengan Google',
    googlePending: 'Membuka Google…',
    googleFailed: 'Tidak bisa menghubungi Google. Coba lagi.',
    errors: {
      account_not_linked:
        'Sudah ada akun dengan alamat itu dan alamatnya belum terverifikasi — jadi login Google tidak kami sambungkan otomatis. Minta admin memverifikasinya, lalu masuk lagi.',
      fallback: 'Google menolak percobaan masuk itu. Coba lagi.',
    } as Record<string, string>,
    whyGoogle:
      'Google satu-satunya jalan masuk. Masuk pertama kali sekaligus membuat akun Anda — tidak ada pendaftaran terpisah, dan tidak ada kata sandi yang bisa kami hilangkan.',
    keysNote:
      'Perkakas ini menyimpan kunci Gemini yang Anda tambahkan, jadi ia sengaja tidak menyimpan kata sandi Anda.',
  },

  tool: {
    keysButton: 'Kunci',
    keySummary: (keys: number, parallel: number) =>
      `${keys} kunci · ${parallel} paralel`,
    keyCount: (keys: number) => `${keys} kunci di akun ini`,
    tabGenerate: 'Buat',
    tabHistory: 'Riwayat',

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

    resumeTitle: 'Ada run yang belum selesai',
    resumeBody: (folder: string, done: number, total: number) =>
      `${done} dari ${total} berkas di ${folder} sudah beres sebelum tab ini ditutup. Lanjutkan dan yang sudah jadi dilewati — tidak ada kunci yang membayar berkas yang sama dua kali.`,
    resumeAction: 'Lanjutkan di folder itu',
    resumeDismiss: 'Lupakan',
    resumeDenied:
      'Tanpa izin ke folder itu tidak ada yang bisa dibaca. Pilih lagi folder yang sama di bawah, run akan lanjut dari tempat berhentinya.',
    runningNote:
      'Biarkan tab ini terbuka — model dipanggil dari sini. Kalau ditutup, semua yang sudah selesai tetap tersimpan: di folder Anda dan di Riwayat.',

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
    manage: 'Kelola kunci',
    keysUsed: 'Dipakai bersamaan',
    keysAll: (keys: number) => `semua ${keys} kunci`,
    keysExactly: (keys: number) => `${keys} kunci`,
    workersUsed: 'Berkas sekaligus',
    workersAuto: (workers: number) => `otomatis (${workers})`,
    workersExactly: (workers: number) => `${workers} berkas`,
    workersNote:
      'Di atas delapan sekaligus, untungnya cuma terasa untuk berkas kecil dan koneksi cepat — run video malah bisa bikin tab ini kehabisan memori. Tiap worker butuh satu kunci sendiri, jadi daftarnya berhenti di jumlah kunci yang dipakai.',
    keysHeldBack: (held: number) =>
      `${held} kunci tidak ikut run ini — kuotanya tidak tersentuh.`,
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
    firstTitle: 'Satu kunci gratis, lalu perkakas ini siap jalan',
    firstBody:
      'Perkakas ini berjalan dengan kunci Google Gemini milik Anda sendiri. Gratis, cuma perlu semenit untuk membuatnya, dan tidak perlu yang lain.',
    firstCta: 'Tambahkan kunci Gemini Anda',
    firstWhere: (
      <>
        Belum punya? Masuk ke{' '}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-4"
        >
          aistudio.google.com/apikey
        </a>
        , tekan <strong className="text-foreground">Create API key</strong>,
        lalu tempelkan di sini.
      </>
    ),
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
    fallbackNote: 'model cadangan — tulis manual atau jalankan ulang',
    notGenerated: 'Tidak dibuat —',
    filenameInCsv: 'Nama berkas di CSV',
    onDisk: (name: string) => `di disk: ${name}`,
    titleLabel: 'Judul',
    descriptionLabel: 'Deskripsi',
    chars: (count: number) => `${count} karakter`,
    keywords: 'Kata kunci',
    keywordPlaceholder: '+ kata kunci',
    copyAria: (field: string) => `Salin ${field.toLowerCase()}`,
    copied: 'Tersalin',
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
    keyCooldown: (index: number, consecutive: number, seconds: number) =>
      `Kunci ${index} kena limit (429) — istirahat ${seconds} detik (${consecutive}/5)`,
    keyDead: (index: number) => `Kunci ${index} kuotanya habis untuk hari ini`,
    keyDemoted: (index: number) =>
      `Kunci ${index} sudah habis jatah cepatnya hari ini — lanjut pakai model cadangan: lebih lambat, tapi jatahnya jauh lebih besar`,
    modelFallback: (name: string) =>
      `${name}: mencoba ulang dengan model cadangan`,
    partial: (done: number, total: number, remaining: number) =>
      `Run sebagian: ${done}/${total} selesai, ${remaining} tersisa. Belum ada CSV — jalankan lagi untuk melanjutkan.`,
    finished: (csvName: string, rows: number) =>
      `${csvName} ditulis (${rows} baris)`,
  },

  vectorizer: {
    index: 'Vectorizer',
    title: 'Gambar jadi SVG dan EPS',
    badge: 'beta',
    vectorize: 'Vectorize',
    tokens: (count: number) => `${count} token`,
    lead: (trial: number) =>
      `Gambar raster masuk, SVG dan EPS 4000 px keluar, dengan pengaturan yang diterima Shutterstock dan Adobe Stock. Satu gambar memakai satu token, dan berkas yang gagal tokennya dikembalikan. Tiap akun mulai dengan ${trial} token, dan tiap berkas yang selesai menyimpan ketiganya: gambar asli Anda, SVG dan EPS.`,
    queueNote:
      'Penelusurannya dikerjakan di mesin kami, beberapa gambar sekaligus, jadi satu batch bisa mengantre dulu sebelum jalan. Halaman ini memperbarui dirinya sendiri — boleh ditutup lalu dibuka lagi nanti.',
    storageMissing: (
      <>
        Penyimpanan belum diatur di server ini, jadi tidak ada yang bisa
        diunggah. Isi variabel <code className="font-mono text-xs">R2_*</code> —
        lihat <code className="font-mono text-xs">.env.example</code>.
      </>
    ),

    picker: {
      drop: 'Jatuhkan gambar di sini, atau pilih dari berkas.',
      hint: (mb: number) => `PNG · JPEG · GIF · BMP · WebP · maksimal ${mb} MB per berkas`,
      choose: 'Pilih gambar',
      notRaster: (name: string) =>
        `${name} — alat ini menerima gambar raster (PNG, JPEG, GIF, BMP, WebP)`,
      tooBig: (name: string, mb: number) => `${name} — lebih dari ${mb} MB`,
      empty: (name: string) => `${name} — kosong`,
      sameStem: (name: string, other: string) =>
        `${name} — namanya sama dengan ${other} sebelum ekstensi; keduanya akan tersimpan jadi satu .svg`,
      onlyFirst: (max: number) =>
        `Hanya ${max} berkas pertama yang diambil — itu satu batch.`,
    },

    batch: {
      label: 'Beri nama batch ini',
      placeholder: (count: number) => `${count} gambar`,
      cost: (files: number, cost: number, balance: number) =>
        `${files} berkas · ${cost} token · sisa ${balance}`,
      queue: 'Antrekan batch',
      uploading: (done: number, total: number) => `Mengunggah ${done}/${total}`,
      cantAfford: (cost: number, balance: number) =>
        `Batch ini butuh ${cost} token dan sisa Anda ${balance}. Hubungi kami kalau perlu tambahan, nanti kami isikan ke akun Anda.`,
      remove: (name: string) => `Hapus ${name}`,
      uploadFailed: (name: string, detail: string) => `${name}: ${detail}`,
      uploadFailedStatus: (status: number) => `gagal diunggah (${status})`,
      uploadFailedPlain: 'gagal diunggah',
    },

    jobs: {
      heading: 'Batch',
      empty: 'Belum ada antrean. Jatuhkan beberapa gambar di atas.',
      batch: 'Batch',
      status: 'Status',
      done: 'Selesai',
      failed: 'Gagal',
      tokens: 'Token',
      created: 'Dibuat',
      open: 'Buka',
    },

    job: {
      back: 'Semua batch',
      progress: (done: number, total: number) => `${done} dari ${total} selesai`,
      refunded: (count: number) => `, ${count} gagal dan tokennya dikembalikan`,
      charged: (count: number) => `${count} token terpakai`,
      refreshing: 'halaman ini menyegarkan dirinya sendiri selama worker bekerja',
      file: 'Berkas',
      note: 'Catatan',
      download: 'Unduh',
      original: 'Asli',
      svg: 'SVG',
      eps: 'EPS',
    },

    bulk: {
      button: 'Unduh semua sebagai zip',
      zipping: (done: number, ready: number) => `Membungkus ${done}/${ready}`,
      summary: (images: number, files: number) =>
        `${images} gambar · ${files} berkas (asli + SVG + EPS)`,
      nothingReady: 'Belum ada yang selesai di batch ini.',
      nothingDownloaded:
        'Tidak ada yang terunduh — batch ini mungkin sudah lewat masa simpannya.',
      someFailed: (packed: number, failed: number) =>
        `${packed} berkas dibungkus, ${failed} gagal.`,
      saved: (images: number, files: number, folder: string) =>
        `${images} gambar — ${files} berkas di ${folder}.zip`,
      fileFailed: (name: string, detail: string) => `${name}: ${detail}`,
      couldNotDownload: 'tidak bisa diunduh',
      r2Answered: (status: number) => `penyimpanan menjawab ${status}`,
    },

    toast: {
      refunded: (count: number) =>
        `${count} berkas gagal diunggah — ${count} token dikembalikan.`,
      nothingQueued: 'Tidak ada yang terunggah, jadi tidak ada yang diantrekan.',
      queued: (count: number) => `${count} berkas masuk antrean.`,
    },

    ledger: {
      heading: 'Aktivitas token terakhir',
      signup: 'token percobaan',
      grant: 'ditambahkan untuk Anda',
      spend: 'batch',
      refund: 'dikembalikan',
      adjust: 'penyesuaian',
    },
  },
}
