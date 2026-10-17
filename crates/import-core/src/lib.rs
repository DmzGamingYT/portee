//! Noyau d'import audio pour SpotifyCraft.
//!
//! Le navigateur lit les octets utiles du fichier (en-tête ID3, bloc FLAC,
//! derniers 128 octets) puis délègue ici le décodage : frames ID3v2, commentaires
//! Vorbis, APIC et PICTURE. Le résultat est renvoyé sous forme d'objet JS simple
//! (`title`, `artist`, `album`, `genre`, `picture`, `pictureMime`, `complete`).
//!
//! `complete` indique si toute la zone de métadonnées tenait dans le tampon :
//! le JS s'en sert pour décider d'une lecture ciblée de secours (pochette
//! située après la fin du tampon).

// Les fonctions de parsing sont exposées uniquement côté wasm ; un build natif
// sans tests ne les voit pas comme utilisées.
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

#[cfg(target_arch = "wasm32")]
use js_sys::{Object, Reflect, Uint8Array};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

const MAX_PICTURE_BYTES: usize = 8 * 1024 * 1024;
const MAX_FRAMES: usize = 4096;
const MAX_BLOCKS: usize = 256;

#[derive(Default)]
struct Parsed {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    picture: Option<Vec<u8>>,
    picture_mime: Option<String>,
    complete: bool,
}

impl Parsed {
    fn set_picture(&mut self, picture_type: u32, data: Vec<u8>, mime: String, fallback: &mut Option<(Vec<u8>, String)>) {
        if picture_type == 3 {
            if self.picture.is_none() {
                self.picture = Some(data);
                self.picture_mime = Some(mime);
                *fallback = None;
            }
        } else if self.picture.is_none() && fallback.is_none() {
            *fallback = Some((data, mime));
        }
    }

    fn apply_fallback(&mut self, fallback: Option<(Vec<u8>, String)>) {
        if self.picture.is_none() {
            if let Some((data, mime)) = fallback {
                self.picture = Some(data);
                self.picture_mime = Some(mime);
            }
        }
    }
}

/* ------------------------------- API WASM --------------------------------- */

/// Décode les tags d'un tampon audio (ID3v2, ID3v1 ou FLAC/Vorbis).
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn parse_tags(bytes: &[u8]) -> JsValue {
    let parsed = parse(bytes, false).unwrap_or_default();
    to_js(parsed)
}

/// Décode les tags **et** la pochette intégrée du tampon fourni.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn parse_cover(bytes: &[u8]) -> JsValue {
    let parsed = parse(bytes, true).unwrap_or_default();
    to_js(parsed)
}

/// Décode un bloc FLAC `PICTURE` seul (sans l'en-tête `fLaC`).
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn parse_flac_picture(bytes: &[u8]) -> JsValue {
    let mut parsed = Parsed::default();
    parsed.complete = true;
    if let Some((_type, data, mime)) = picture_block(bytes) {
        parsed.picture = Some(data);
        parsed.picture_mime = Some(mime);
    }
    to_js(parsed)
}

/* --------------------------------- sortie --------------------------------- */

#[cfg(target_arch = "wasm32")]
fn to_js(parsed: Parsed) -> JsValue {
    let obj = Object::new();
    set_optional(&obj, "title", parsed.title);
    set_optional(&obj, "artist", parsed.artist);
    set_optional(&obj, "album", parsed.album);
    set_optional(&obj, "genre", parsed.genre);
    let _ = Reflect::set(&obj, &JsValue::from_str("complete"), &JsValue::from_bool(parsed.complete));

    if let (Some(data), Some(mime)) = (parsed.picture, parsed.picture_mime) {
        let array = Uint8Array::new_with_length(data.len() as u32);
        array.copy_from(&data);
        let _ = Reflect::set(&obj, &JsValue::from_str("picture"), array.as_ref());
        let _ = Reflect::set(&obj, &JsValue::from_str("pictureMime"), &JsValue::from_str(&mime));
    }

    obj.into()
}

#[cfg(target_arch = "wasm32")]
fn set_optional(obj: &Object, key: &str, value: Option<String>) {
    if let Some(text) = value {
        let _ = Reflect::set(obj, &JsValue::from_str(key), &JsValue::from_str(&text));
    }
}

/* ------------------------------- dispatch --------------------------------- */

fn parse(bytes: &[u8], want_picture: bool) -> Option<Parsed> {
    if bytes.starts_with(b"ID3") {
        return Some(parse_id3(bytes, want_picture));
    }
    if bytes.starts_with(b"fLaC") {
        return Some(parse_flac(bytes, want_picture));
    }
    if bytes.starts_with(b"TAG") {
        return Some(parse_id3v1(bytes));
    }
    None
}

/* ---------------------------------- ID3 ----------------------------------- */

fn parse_id3(bytes: &[u8], want_picture: bool) -> Parsed {
    let mut out = Parsed::default();
    if bytes.len() < 10 {
        return out;
    }
    let version = bytes[3];
    if version != 3 && version != 4 {
        return out;
    }
    let flags = bytes[5];
    if flags & 0x80 != 0 {
        return out; // tag unsynchronisé : positions non fiables
    }

    let Some(tag_size) = syncsafe(bytes, 6) else {
        return out;
    };
    let tag_end = 10usize.saturating_add(tag_size);
    out.complete = tag_end <= bytes.len();
    let end = tag_end.min(bytes.len());

    let mut offset = 10usize;
    if flags & 0x40 != 0 {
        let extended = if version == 4 {
            syncsafe(bytes, 10)
        } else {
            be32(bytes, 10).map(|value| value as usize)
        };
        match extended {
            Some(size) if size >= 6 && offset + size <= end => offset += size,
            _ => return out,
        }
    }

    let mut fallback: Option<(Vec<u8>, String)> = None;

    for _ in 0..MAX_FRAMES {
        if offset + 10 > end {
            break;
        }
        let id = &bytes[offset..offset + 4];
        if !id.iter().all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit()) {
            break;
        }

        let size = if version == 4 {
            syncsafe(bytes, offset + 4)
        } else {
            be32(bytes, offset + 4).map(|value| value as usize)
        };
        let Some(size) = size else { break };
        if size == 0 || offset + 10 + size > end {
            break;
        }

        let payload = &bytes[offset + 10..offset + 10 + size];
        match id {
            b"TIT2" => out.title = decode_text(payload),
            b"TPE1" => out.artist = decode_text(payload),
            b"TPE2" => {
                if out.artist.is_none() {
                    out.artist = decode_text(payload);
                }
            }
            b"TALB" => out.album = decode_text(payload),
            b"TCON" => {
                out.genre = decode_text(payload)
                    .map(|value| clean_genre(&value))
                    .filter(|value| !value.is_empty());
            }
            b"APIC" if want_picture => {
                if let Some((picture_type, data, mime)) = apic(payload) {
                    out.set_picture(picture_type, data, mime, &mut fallback);
                }
            }
            _ => {}
        }

        offset += 10 + size;
    }

    out.apply_fallback(fallback);
    out
}

fn parse_id3v1(bytes: &[u8]) -> Parsed {
    let mut out = Parsed::default();
    if bytes.len() < 128 {
        return out;
    }
    let base = bytes.len() - 128;
    out.title = text_field(&bytes[base + 3..base + 33]);
    out.artist = text_field(&bytes[base + 33..base + 63]);
    out.album = text_field(&bytes[base + 63..base + 93]);
    out.complete = true;
    out
}

fn apic(payload: &[u8]) -> Option<(u32, Vec<u8>, String)> {
    if payload.len() < 4 {
        return None;
    }
    let encoding = payload[0];
    let mut offset = 1usize;

    let mut mime = String::new();
    while offset < payload.len() && payload[offset] != 0 {
        mime.push(payload[offset] as char);
        offset += 1;
    }
    if offset >= payload.len() {
        return None;
    }
    offset += 1;

    let picture_type = payload.get(offset).copied()? as u32;
    offset += 1;

    if encoding == 1 || encoding == 2 {
        while offset + 1 < payload.len() && !(payload[offset] == 0 && payload[offset + 1] == 0) {
            offset += 2;
        }
        offset += 2;
    } else {
        while offset < payload.len() && payload[offset] != 0 {
            offset += 1;
        }
        offset += 1;
    }

    if offset >= payload.len() {
        return None;
    }
    let data = payload[offset..].to_vec();
    if data.is_empty() || data.len() > MAX_PICTURE_BYTES {
        return None;
    }

    Some((picture_type, data, normalize_image_mime(&mime)))
}

/* ---------------------------------- FLAC ---------------------------------- */

fn parse_flac(bytes: &[u8], want_picture: bool) -> Parsed {
    let mut out = Parsed::default();
    let mut offset = 4usize;
    let mut fallback: Option<(Vec<u8>, String)> = None;

    for _ in 0..MAX_BLOCKS {
        if offset + 4 > bytes.len() {
            break;
        }
        let header = bytes[offset];
        let last = header & 0x80 != 0;
        let block_type = header & 0x7f;
        let length = ((bytes[offset + 1] as usize) << 16)
            | ((bytes[offset + 2] as usize) << 8)
            | (bytes[offset + 3] as usize);
        let start = offset + 4;
        if start + length > bytes.len() {
            break; // bloc tronqué : `complete` reste faux
        }

        let block = &bytes[start..start + length];
        match block_type {
            4 => vorbis_comment(block, &mut out),
            6 if want_picture => {
                if let Some((picture_type, data, mime)) = picture_block(block) {
                    out.set_picture(picture_type, data, mime, &mut fallback);
                }
            }
            _ => {}
        }

        offset = start + length;
        if last {
            out.complete = true;
            break;
        }
    }

    out.apply_fallback(fallback);
    out
}

fn vorbis_comment(block: &[u8], out: &mut Parsed) {
    let mut offset = 0usize;
    let Some(vendor_length) = le32(block, offset) else { return };
    offset += 4 + vendor_length as usize;
    let Some(count) = le32(block, offset) else { return };
    offset += 4;

    for _ in 0..count.min(MAX_FRAMES as u32) {
        let Some(length) = le32(block, offset) else { break };
        offset += 4;
        let length = length as usize;
        if offset + length > block.len() {
            break;
        }
        let entry = &block[offset..offset + length];
        offset += length;

        let Some(separator) = entry.iter().position(|byte| *byte == b'=') else {
            continue;
        };
        let key = String::from_utf8_lossy(&entry[..separator]).to_ascii_uppercase();
        let value = String::from_utf8_lossy(&entry[separator + 1..]).trim().to_string();
        if value.is_empty() {
            continue;
        }

        match key.as_str() {
            "TITLE" => out.title = Some(value),
            "ARTIST" => out.artist = Some(value),
            "ALBUMARTIST" => {
                if out.artist.is_none() {
                    out.artist = Some(value);
                }
            }
            "ALBUM" => out.album = Some(value),
            "GENRE" => out.genre = Some(clean_genre(&value)),
            _ => {}
        }
    }
}

fn picture_block(block: &[u8]) -> Option<(u32, Vec<u8>, String)> {
    let mut offset = 0usize;
    let picture_type = be32(block, offset)?;
    offset += 4;

    let mime_length = be32(block, offset)? as usize;
    offset += 4;
    if mime_length == 0 || offset + mime_length > block.len() {
        return None;
    }
    let mime = String::from_utf8_lossy(&block[offset..offset + mime_length]).to_string();
    offset += mime_length;

    let description_length = be32(block, offset)? as usize;
    offset += 4;
    if offset + description_length > block.len() {
        return None;
    }
    offset += description_length;

    // width, height, depth, colors
    if offset + 20 > block.len() {
        return None;
    }
    offset += 16;

    let data_length = be32(block, offset)? as usize;
    offset += 4;
    if data_length == 0 || data_length > MAX_PICTURE_BYTES || offset + data_length > block.len() {
        return None;
    }

    Some((
        picture_type,
        block[offset..offset + data_length].to_vec(),
        normalize_image_mime(&mime),
    ))
}

/* -------------------------------- helpers --------------------------------- */

fn syncsafe(bytes: &[u8], offset: usize) -> Option<usize> {
    if offset + 4 > bytes.len() {
        return None;
    }
    Some(
        (((bytes[offset] & 0x7f) as usize) << 21)
            | (((bytes[offset + 1] & 0x7f) as usize) << 14)
            | (((bytes[offset + 2] & 0x7f) as usize) << 7)
            | ((bytes[offset + 3] & 0x7f) as usize),
    )
}

fn be32(bytes: &[u8], offset: usize) -> Option<u32> {
    if offset + 4 > bytes.len() {
        return None;
    }
    Some(
        ((bytes[offset] as u32) << 24)
            | ((bytes[offset + 1] as u32) << 16)
            | ((bytes[offset + 2] as u32) << 8)
            | (bytes[offset + 3] as u32),
    )
}

fn le32(bytes: &[u8], offset: usize) -> Option<u32> {
    if offset + 4 > bytes.len() {
        return None;
    }
    Some(
        (bytes[offset] as u32)
            | ((bytes[offset + 1] as u32) << 8)
            | ((bytes[offset + 2] as u32) << 16)
            | ((bytes[offset + 3] as u32) << 24),
    )
}

fn decode_text(payload: &[u8]) -> Option<String> {
    if payload.len() < 2 {
        return None;
    }
    let encoding = payload[0];
    let bytes = &payload[1..];

    let text = match encoding {
        1 => decode_utf16(bytes, true),
        2 => decode_utf16(bytes, false),
        3 => String::from_utf8_lossy(bytes).into_owned(),
        _ => bytes.iter().map(|byte| *byte as char).collect(),
    };

    let cleaned = clean_text(&text);
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

fn decode_utf16(bytes: &[u8], bom: bool) -> String {
    let mut start = 0usize;
    let mut little_endian = true;
    if bom && bytes.len() >= 2 {
        if bytes[0] == 0xff && bytes[1] == 0xfe {
            start = 2;
            little_endian = true;
        } else if bytes[0] == 0xfe && bytes[1] == 0xff {
            start = 2;
            little_endian = false;
        }
    }

    let units: Vec<u16> = bytes[start..]
        .chunks_exact(2)
        .map(|pair| {
            if little_endian {
                u16::from_le_bytes([pair[0], pair[1]])
            } else {
                u16::from_be_bytes([pair[0], pair[1]])
            }
        })
        .collect();

    String::from_utf16_lossy(&units)
}

fn clean_text(value: &str) -> String {
    value
        .split('\u{0}')
        .map(|part| {
            part.chars()
                .filter(|char| !char.is_control() || *char == '\t' || *char == '\n' || *char == '\r')
                .collect::<String>()
                .trim()
                .to_string()
        })
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

fn text_field(bytes: &[u8]) -> Option<String> {
    let text: String = bytes
        .iter()
        .take_while(|byte| **byte != 0)
        .map(|byte| *byte as char)
        .collect();
    let text = text.trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn clean_genre(value: &str) -> String {
    let mut genre = value.trim();

    if let Some(rest) = genre.strip_prefix('(') {
        if let Some(close) = rest.find(')') {
            let number = &rest[..close];
            if !number.is_empty() && number.chars().all(|char| char.is_ascii_digit()) {
                genre = rest[close + 1..].trim();
            }
        }
    }

    if genre.chars().all(|char| char.is_ascii_digit()) {
        String::new()
    } else {
        genre.to_string()
    }
}

fn normalize_image_mime(value: &str) -> String {
    let mime = value.trim().to_ascii_lowercase();
    if !mime.starts_with("image/") {
        return "image/jpeg".to_string();
    }
    if mime == "image/jpg" {
        return "image/jpeg".to_string();
    }
    mime
}

/* --------------------------------- tests ---------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    const JPEG: [u8; 6] = [0xff, 0xd8, 0xff, 0xe0, 0x01, 0xd9];

    fn be32_bytes(value: usize) -> [u8; 4] {
        [
            ((value >> 24) & 0xff) as u8,
            ((value >> 16) & 0xff) as u8,
            ((value >> 8) & 0xff) as u8,
            (value & 0xff) as u8,
        ]
    }

    fn syncsafe_bytes(value: usize) -> [u8; 4] {
        [
            ((value >> 21) & 0x7f) as u8,
            ((value >> 14) & 0x7f) as u8,
            ((value >> 7) & 0x7f) as u8,
            (value & 0x7f) as u8,
        ]
    }

    fn apic_payload(picture_type: u8) -> Vec<u8> {
        let mut payload = vec![0u8]; // encodage latin-1
        payload.extend_from_slice(b"image/jpeg\0");
        payload.push(picture_type);
        payload.extend_from_slice(b"cover\0");
        payload.extend_from_slice(&JPEG);
        payload
    }

    fn frame(id: &[u8; 4], payload: &[u8], version: u8) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(id);
        if version == 4 {
            out.extend_from_slice(&syncsafe_bytes(payload.len()));
        } else {
            out.extend_from_slice(&be32_bytes(payload.len()));
        }
        out.extend_from_slice(&[0, 0]);
        out.extend_from_slice(payload);
        out
    }

    fn id3(frames: Vec<Vec<u8>>, version: u8) -> Vec<u8> {
        let body: Vec<u8> = frames.concat();
        let mut out = vec![b'I', b'D', b'3', version, 0, 0];
        out.extend_from_slice(&syncsafe_bytes(body.len()));
        out.extend_from_slice(&body);
        out
    }

    fn text_frame(id: &[u8; 4], value: &str) -> Vec<u8> {
        let mut payload = vec![3u8]; // UTF-8
        payload.extend_from_slice(value.as_bytes());
        frame(id, &payload, 3)
    }

    #[test]
    fn lit_les_tags_id3v2() {
        let tag = id3(
            vec![
                text_frame(b"TIT2", "Titre"),
                text_frame(b"TPE1", "Artiste"),
                text_frame(b"TALB", "Album"),
                text_frame(b"TCON", "(17)Rock"),
            ],
            3,
        );
        let parsed = parse_id3(&tag, false);
        assert_eq!(parsed.title.as_deref(), Some("Titre"));
        assert_eq!(parsed.artist.as_deref(), Some("Artiste"));
        assert_eq!(parsed.album.as_deref(), Some("Album"));
        assert_eq!(parsed.genre.as_deref(), Some("Rock"));
        assert!(parsed.complete);
    }

    #[test]
    fn extrait_la_pochette_recto() {
        let tag = id3(
            vec![
                frame(b"APIC", &apic_payload(0), 3),
                frame(b"APIC", &apic_payload(3), 3),
            ],
            3,
        );
        let parsed = parse_id3(&tag, true);
        assert_eq!(parsed.picture.as_deref(), Some(&JPEG[..]));
        assert_eq!(parsed.picture_mime.as_deref(), Some("image/jpeg"));
    }

    #[test]
    fn ignore_la_pochette_si_non_demandee() {
        let tag = id3(vec![frame(b"APIC", &apic_payload(3), 3)], 3);
        assert!(parse_id3(&tag, false).picture.is_none());
    }

    #[test]
    fn decode_utf16_avec_bom() {
        let mut payload = vec![1u8, 0xff, 0xfe];
        for unit in "Beyoncé".encode_utf16() {
            payload.extend_from_slice(&unit.to_le_bytes());
        }
        let tag = id3(vec![frame(b"TPE1", &payload, 3)], 3);
        let parsed = parse_id3(&tag, false);
        assert_eq!(parsed.artist.as_deref(), Some("Beyoncé"));
    }

    #[test]
    fn lit_id3v1() {
        let mut tag = vec![0u8; 128];
        tag[0] = b'T';
        tag[1] = b'A';
        tag[2] = b'G';
        tag[3..8].copy_from_slice(b"Titre");
        tag[33..38].copy_from_slice(b"Artis");
        let parsed = parse_id3v1(&tag);
        assert_eq!(parsed.title.as_deref(), Some("Titre"));
        assert_eq!(parsed.artist.as_deref(), Some("Artis"));
    }

    fn flac_block(block_type: u8, payload: &[u8], last: bool) -> Vec<u8> {
        let mut out = Vec::new();
        out.push(if last { block_type | 0x80 } else { block_type });
        let length = payload.len();
        out.extend_from_slice(&[
            ((length >> 16) & 0xff) as u8,
            ((length >> 8) & 0xff) as u8,
            (length & 0xff) as u8,
        ]);
        out.extend_from_slice(payload);
        out
    }

    fn vorbis_comment_block() -> Vec<u8> {
        let mut block = Vec::new();
        block.extend_from_slice(&3u32.to_le_bytes()); // vendor "abc"
        block.extend_from_slice(b"abc");
        block.extend_from_slice(&4u32.to_le_bytes());
        for entry in ["TITLE=Chanson", "ARTIST=Interprète", "ALBUM=Disque", "GENRE=(8)Pop"] {
            block.extend_from_slice(&(entry.len() as u32).to_le_bytes());
            block.extend_from_slice(entry.as_bytes());
        }
        block
    }

    fn picture_payload() -> Vec<u8> {
        let mut block = Vec::new();
        block.extend_from_slice(&be32_bytes(3));
        block.extend_from_slice(&be32_bytes(10));
        block.extend_from_slice(b"image/jpeg");
        block.extend_from_slice(&be32_bytes(0));
        block.extend_from_slice(&be32_bytes(600));
        block.extend_from_slice(&be32_bytes(600));
        block.extend_from_slice(&be32_bytes(24));
        block.extend_from_slice(&be32_bytes(0));
        block.extend_from_slice(&be32_bytes(JPEG.len()));
        block.extend_from_slice(&JPEG);
        block
    }

    #[test]
    fn lit_les_commentaires_vorbis() {
        let mut file = b"fLaC".to_vec();
        file.extend_from_slice(&flac_block(4, &vorbis_comment_block(), true));
        let parsed = parse_flac(&file, false);
        assert_eq!(parsed.title.as_deref(), Some("Chanson"));
        assert_eq!(parsed.artist.as_deref(), Some("Interprète"));
        assert_eq!(parsed.album.as_deref(), Some("Disque"));
        assert_eq!(parsed.genre.as_deref(), Some("Pop"));
        assert!(parsed.complete);
    }

    #[test]
    fn lit_la_pochette_flac() {
        let mut file = b"fLaC".to_vec();
        file.extend_from_slice(&flac_block(4, &vorbis_comment_block(), false));
        file.extend_from_slice(&flac_block(6, &picture_payload(), true));
        let parsed = parse_flac(&file, true);
        assert_eq!(parsed.picture.as_deref(), Some(&JPEG[..]));
        assert_eq!(parsed.picture_mime.as_deref(), Some("image/jpeg"));
        assert!(parsed.complete);
    }

    #[test]
    fn signale_une_zone_tronquee() {
        let mut file = b"fLaC".to_vec();
        file.extend_from_slice(&flac_block(6, &picture_payload(), true));
        let truncated = &file[..file.len() - 1];
        assert!(!parse_flac(truncated, true).complete);
    }

    #[test]
    fn parse_le_bloc_picture_isole() {
        let mut parsed = Parsed::default();
        let mut fallback = None;
        if let Some((picture_type, data, mime)) = picture_block(&picture_payload()) {
            parsed.set_picture(picture_type, data, mime, &mut fallback);
        }
        assert_eq!(parsed.picture.as_deref(), Some(&JPEG[..]));
    }
}
