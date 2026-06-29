UPDATE movies
SET
    wtp_library = 'Library'
WHERE
    wtp_library NOT IN('WTP', 'WTP/BD')
    OR wtp_library IS NULL;

UPDATE movies
SET
    is_bangladeshi = TRUE
WHERE
    title IN (
        'Poramon',
        'Agnee',
        'Poramon - 2',
        'Dohon',
        'Bhalobasha Ajkal',
        'Onek Shadher Moina',
        'Bhalobasar Rong',
        'Honeymoon',
        'Beporowa',
        'Jinn',
        'Mona (Jinn 2)',
        'Onno Rokom Bhalobasha',
        'Tobuo Bhalobashi',
        'Onek Damer Kena',
        'Premi O Premi',
        'Dhattariky',
        'Pashan',
        'Dobir Saheber Songsar',
        'Desha - The Leade',
        'Meyeti Ekhon Kothay Jabe',
        'Paap'
    );
