-- Migration: Add wtp_library column to movies table
-- Values: 'WTP', 'WTP/BD', 'Library', or NULL

-- Step 1: Add the new column
ALTER TABLE movies ADD COLUMN IF NOT EXISTS wtp_library VARCHAR(20);

-- Step 2: Update existing movies based on WTP record CSV data
-- Matching by title (case-insensitive, trimmed)
UPDATE movies SET language = 'Bengali' WHERE source = 'acquired';

UPDATE movies SET wtp_library = NULL;

-- WTP movies
UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Khela Jawkhon'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Dilkhush'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(
        TRIM(
            'The Eken - Ruddhoshwash Rajasthan'
        )
    );

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Cheeni 2'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Kabuliwala'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Athhoi'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Shontaan'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(
        TRIM('Sotti Bole Sotti Kichhu Nei')
    );

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Pokkhirajer Dim'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Killbill Society'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(
        TRIM(
            'The Eken: Benaras e Bibhishika'
        )
    );

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Ei Raat Tomar Amaar'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(
        TRIM(
            'Shri Swapankumarer Badami Hyenar Kobole'
        )
    );

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Raghu Dakat'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(
        TRIM('Lawho Gouranger Naam Rey')
    );

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Vijaynagar''er Hirey'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Datta'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Mitthye Premer Gaan'));

UPDATE movies
SET
    wtp_library = 'WTP'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Kolkatay Kohinoor'));

-- Library movies
UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Sri Sri Tarakeshwar'));

UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Jomer Raja Dilo Bor'));

UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Jamai 420'));

UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Majnu'));

UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Chander Pahar'));

UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    LOWER(TRIM(title)) = LOWER(
        TRIM('Bengali Babu English Mem')
    );

UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Borbad'));

UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Joddha (2014)'));

UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    LOWER(TRIM(title)) = LOWER(
        TRIM('Parbo Na Ami Charte Toke')
    );

-- WTP/BD movies
UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Toofan'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Daagi'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Taandob'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Poramon'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Agnee'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Poramon - 2'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Dohon'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Bhalobasha Ajkal'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Onek Shadher Moina'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Bhalobasar Rong'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Honeymoon'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Beporowa'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Jinn'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Mona (Jinn 2)'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Onno Rokom Bhalobasha'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Tobuo Bhalobashi'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Onek Damer Kena'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Premi O Premi'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Dhattariky'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Pashan'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Dobir Saheber Songsar'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Desha - The Leader'));

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(
        TRIM('Meyeti Ekhon Kothay Jabe')
    );

UPDATE movies
SET
    wtp_library = 'WTP/BD'
WHERE
    LOWER(TRIM(title)) = LOWER(TRIM('Paap'));

-- Verify: Check final counts
SELECT wtp_library, COUNT(*) as count
FROM movies
GROUP BY
    wtp_library
ORDER BY count DESC;
