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
    },
    fallbacks: (count: number) => `(${count} fallback)`,
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
}
