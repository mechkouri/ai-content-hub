import { buildImageBlock } from '../common/inline';
import { protectPictures, restorePictures } from './translation-pictures';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const pic = (id: string, alt: string, caption = '') =>
  buildImageBlock({ assetId: id, alt, caption });

const article = () => ({
  introduction: `Welcome to the open day.\n\n${pic(ID1, 'Students on campus', 'Photo: Jane Doe · CC BY 4.0 · flickr')}\n\nMore text.`,
  sections: [
    {
      heading: 'Labs',
      body: `${pic(ID2, 'A chemistry lab')}\n\nThe labs are open.`,
      subsections: [{ heading: 'Safety', body: 'Wear goggles.' }],
    },
  ],
  conclusion: 'See you soon.',
  faq: [{ question: 'Free?', answer: 'Yes.' }],
});

describe('pictures around a translation', () => {
  it('takes pictures out for the translator, as numbered markers with the description', () => {
    const original = article();
    const { content, pictures } = protectPictures(original);
    expect(content.introduction).toBe(
      'Welcome to the open day.\n\n[[PICTURE 1: Students on campus]]\n\nMore text.',
    );
    expect(content.sections[0].body).toBe('[[PICTURE 2: A chemistry lab]]\n\nThe labs are open.');
    // nothing about the picture's address or credit is shown to the translator
    expect(JSON.stringify(content)).not.toContain(ID1);
    expect(JSON.stringify(content)).not.toContain('Jane Doe');
    expect(pictures.map((p) => p.assetId)).toEqual([ID1, ID2]);
    // the original is untouched
    expect(original.introduction).toContain(ID1);
  });

  it('puts them back with the translated description, and the address and credit unchanged', () => {
    const { pictures } = protectPictures(article());
    const translated = {
      introduction:
        'Bienvenue à la journée portes ouvertes.\n\n[[PICTURE 1: Des étudiants sur le campus]]\n\nPlus de texte.',
      sections: [
        {
          heading: 'Laboratoires',
          body: '[[PICTURE 2: Un laboratoire de chimie]]\n\nLes laboratoires sont ouverts.',
          subsections: [{ heading: 'Sécurité', body: 'Portez des lunettes.' }],
        },
      ],
      conclusion: 'À bientôt.',
      faq: [{ question: 'Gratuit ?', answer: 'Oui.' }],
    };
    const out = restorePictures(translated, pictures);
    expect(out.introduction).toBe(
      `Bienvenue à la journée portes ouvertes.\n\n${pic(ID1, 'Des étudiants sur le campus', 'Photo: Jane Doe · CC BY 4.0 · flickr')}\n\nPlus de texte.`,
    );
    expect(out.sections[0].body).toBe(
      `${pic(ID2, 'Un laboratoire de chimie')}\n\nLes laboratoires sont ouverts.`,
    );
    expect(out.conclusion).toBe('À bientôt.');
  });

  it('tolerates a translator that changes the marker’s case, spacing or word', () => {
    const { pictures } = protectPictures(article());
    const out = restorePictures(
      {
        introduction: '[[ picture 1 : Étudiants ]]\n\nTexte.',
        sections: [{ heading: 'h', body: '[[IMAGE 2]]\n\nTexte.' }],
        conclusion: 'c',
        faq: [],
      },
      pictures,
    );
    expect(out.introduction).toBe(
      `${pic(ID1, 'Étudiants', 'Photo: Jane Doe · CC BY 4.0 · flickr')}\n\nTexte.`,
    );
    expect(out.sections[0].body).toBe(`${pic(ID2, 'A chemistry lab')}\n\nTexte.`); // no description given: keeps the original
  });

  it('never loses a picture: one the translator dropped goes back where it was', () => {
    const { pictures } = protectPictures(article());
    const out = restorePictures(
      {
        introduction: 'Bienvenue.',
        sections: [{ heading: 'Labs', body: 'Les laboratoires.' }],
        conclusion: 'À bientôt.',
        faq: [],
      },
      pictures,
    );
    expect(out.introduction).toBe(
      `Bienvenue.\n\n${pic(ID1, 'Students on campus', 'Photo: Jane Doe · CC BY 4.0 · flickr')}`,
    );
    expect(out.sections[0].body).toBe(`Les laboratoires.\n\n${pic(ID2, 'A chemistry lab')}`);
  });

  it('puts a picture at the end of the conclusion when its place no longer exists', () => {
    const { pictures } = protectPictures(article());
    const out = restorePictures(
      { introduction: 'I.', sections: [], conclusion: 'C.', faq: [] },
      pictures,
    );
    expect(out.conclusion).toBe(`C.\n\n${pic(ID2, 'A chemistry lab')}`);
    expect(out.introduction).toContain(ID1);
  });

  it('uses each picture once, and drops markers it does not know', () => {
    const { pictures } = protectPictures(article());
    const out = restorePictures(
      {
        introduction:
          '[[PICTURE 1: A]]\n\nText.\n\n[[PICTURE 1: A again]]\n\n[[PICTURE 9: invented]]',
        sections: [{ heading: 'h', body: '[[PICTURE 2: B]]' }],
        conclusion: 'c',
        faq: [],
      },
      pictures,
    );
    expect(out.introduction.match(new RegExp(ID1, 'g'))).toHaveLength(1);
    expect(out.introduction).not.toContain('PICTURE');
    expect(out.introduction).not.toContain('invented');
  });

  it('removes a marker left in the middle of a sentence', () => {
    const { pictures } = protectPictures(article());
    const out = restorePictures(
      {
        introduction: 'Voir [[PICTURE 1: x]] ci-dessus.\n\n[[PICTURE 1: ok]]',
        sections: [{ heading: 'h', body: 'b' }],
        conclusion: 'c',
        faq: [],
      },
      pictures,
    );
    expect(JSON.stringify(out)).not.toMatch(/\[\[/);
    expect(out.introduction).toContain('Voir  ci-dessus.'.replace('  ', ' '));
  });

  it('changes nothing for an article without pictures', () => {
    const plain = {
      introduction: 'Hi.',
      sections: [{ heading: 'h', body: 'b' }],
      conclusion: 'c',
      faq: [],
    };
    const p = protectPictures(plain);
    expect(p.pictures).toEqual([]);
    expect(p.content).toEqual(plain);
    expect(restorePictures({ ...plain, introduction: 'Salut.' }, p.pictures).introduction).toBe(
      'Salut.',
    );
  });

  it('copes with a translation that has a different structure', () => {
    const { pictures } = protectPictures(article());
    expect(() => restorePictures({}, pictures)).not.toThrow();
    expect(() => restorePictures(null, pictures)).not.toThrow();
    expect(() => protectPictures(null)).not.toThrow();
  });
});
