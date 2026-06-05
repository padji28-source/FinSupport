const txt = `Tanggal	Keterangan	Jumlah	Jenis		
28-Apr	Suami	6,189,000	Pemasukan		
28-Apr	Ins RT	370,000	Pemasukan		
28-Apr	Istri	6,610,000	Pemasukan		
9-May	Refund Dp Jersey	295,000	Pemasukan`;

const lines = txt.split(/\r?\n/);
let currentType = 'pengeluaran';
let currentYear = 2026;
const newDb = [];

for (const row of lines) {
    if (!row.trim()) continue;
    
    let cols;
    if (row.includes('\t')) {
        cols = row.split('\t');
    } else {
        cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (cols.length < 2) {
            cols = row.split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        }
    }
    
    const parsedCols = cols.map(col => {
        let c = col?.trim();
        if (c?.startsWith('"') && c?.endsWith('"')) {
            c = c.substring(1, c.length - 1).replace(/""/g, '"');
        }
        return c;
    });

    const rowText = parsedCols.join(' ').toLowerCase();
    
    if (rowText.includes('masuk')) currentType = 'pemasukan';
    if (rowText.includes('keluar')) currentType = 'pengeluaran';
    
    const yearMatch = rowText.match(/\b(20\d{2})\b/);
    if (yearMatch) currentYear = parseInt(yearMatch[1], 10);

    let dateStr = '';
    let amt = NaN;
    let desc = '';

    for (let i = 0; i < parsedCols.length; i++) {
        const col = parsedCols[i];
        const dateMatch = col?.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3,}|\d{1,2})/);
        if (dateMatch) {
            const d = dateMatch[1].padStart(2, '0');
            let m = dateMatch[2].toLowerCase().substring(0, 3);
            const months = {
                'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'mei': '05',
                'jun': '06', 'jul': '07', 'aug': '08', 'ags': '08', 'sep': '09', 'oct': '10',
                'okt': '10', 'nov': '11', 'des': '12', 'dec': '12'
            };
            m = months[m] || m.padStart(2, '0');
            dateStr = `${currentYear}-${m}-${d}`;
            
            if (i + 1 < parsedCols.length) desc = parsedCols[i + 1] || '';
            
            for (let j = i + 2; j < parsedCols.length; j++) {
                const rawCol = parsedCols[j];
                if (!rawCol) continue;
                const rawAmtVal = rawCol.replace(/[^0-9]/g, '');
                if (rawAmtVal.length > 0) {
                    amt = parseInt(rawAmtVal, 10);
                    break;
                }
            }
            break;
        }
    }

    if (dateStr && !isNaN(amt) && desc) {
        let user = 'Suami';
        if (rowText.includes('istri')) user = 'Istri';

        let cat = 'Lainnya';
        if (currentType === 'pemasukan') {
            cat = 'Gaji'; 
        } else {
            const d = desc.toLowerCase();
            if (/makan|food|jajan|kopi|grab|gojek|shopee/i.test(d)) cat = 'Makanan';
            else if (/listrik|air|internet|wifi|pulsa/i.test(d)) cat = 'Tagihan';
            else if (/bensin|tol|parkir|krl|bus/i.test(d)) cat = 'Transportasi';
        }

        const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        newDb.push({ id, date: dateStr, amt, desc, cat, type: currentType, user });
    }
}

console.log(newDb);
