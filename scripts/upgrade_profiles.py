from pathlib import Path
p=Path('src/pages/ProfilePage.tsx')
s=p.read_text()
if "ProfileEnhancements" not in s:
    s=s.replace("import { WalletCard } from '@/components/features/WalletCard';", "import { WalletCard } from '@/components/features/WalletCard';\nimport { ProfileEnhancements } from '@/components/features/ProfileEnhancements';")
needle="          {profile.bio && <p className=\"mt-3 whitespace-pre-wrap leading-6\">{profile.bio}</p>}"
if "<ProfileEnhancements profile={profile}" not in s:
    s=s.replace(needle, needle+"\n          <ProfileEnhancements profile={profile} />")
p.write_text(s)

p=Path('src/components/features/ProductionEditProfileDialog.tsx')
s=p.read_text()
repls=[
("  const [linkedin, setLinkedin] = useState('');", "  const [linkedin, setLinkedin] = useState('');\n  const [pronouns, setPronouns] = useState('');\n  const [profession, setProfession] = useState('');\n  const [education, setEducation] = useState('');\n  const [languages, setLanguages] = useState('');\n  const [interests, setInterests] = useState('');\n  const [featuredLink, setFeaturedLink] = useState('');"),
("    setLinkedin(links.linkedin ?? '');", "    setLinkedin(links.linkedin ?? '');\n    setPronouns(links.pronouns ?? '');\n    setProfession(links.profession ?? '');\n    setEducation(links.education ?? '');\n    setLanguages(links.languages ?? '');\n    setInterests(links.interests ?? '');\n    setFeaturedLink(links.featured_link ?? '');"),
("        linkedin: linkedin.trim(),", "        linkedin: linkedin.trim(),\n        pronouns: pronouns.trim(),\n        profession: profession.trim(),\n        education: education.trim(),\n        languages: languages.trim(),\n        interests: interests.trim(),\n        featured_link: featuredLink.trim(),"),
("            <div><Label>LinkedIn</Label><Input value={linkedin} onChange={e => setLinkedin(e.target.value)} disabled={saving} placeholder=\"https://linkedin.com/in/...\" /></div>", "            <div><Label>LinkedIn</Label><Input value={linkedin} onChange={e => setLinkedin(e.target.value)} disabled={saving} placeholder=\"https://linkedin.com/in/...\" /></div>\n            <div><Label>Pronouns</Label><Input value={pronouns} onChange={e => setPronouns(e.target.value)} disabled={saving} placeholder=\"they/them\" /></div>\n            <div><Label>Profession</Label><Input value={profession} onChange={e => setProfession(e.target.value)} disabled={saving} placeholder=\"Designer at Testagram\" /></div>\n            <div><Label>Education</Label><Input value={education} onChange={e => setEducation(e.target.value)} disabled={saving} placeholder=\"University / school\" /></div>\n            <div><Label>Languages</Label><Input value={languages} onChange={e => setLanguages(e.target.value)} disabled={saving} placeholder=\"English, Swahili\" /></div>\n            <div className=\"md:col-span-2\"><Label>Interests</Label><Input value={interests} onChange={e => setInterests(e.target.value)} disabled={saving} placeholder=\"Technology, music, football\" /></div>\n            <div className=\"md:col-span-2\"><Label>Featured link</Label><Input type=\"url\" value={featuredLink} onChange={e => setFeaturedLink(e.target.value)} disabled={saving} placeholder=\"https://...\" /></div>"),
]
for a,b in repls:
    if a in s: s=s.replace(a,b)
p.write_text(s)
print('profile upgrade patch complete')
