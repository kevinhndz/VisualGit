export function parseStatus(output) {
  const result = { branch: null, head: null, ahead: 0, behind: 0, files: [] };
  const records = output.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    if (record.startsWith("# branch.oid ")) {
      const hash = record.slice(13);
      result.head = hash === "(initial)" ? null : hash;
    } else if (record.startsWith("# branch.head ")) {
      result.branch = record.slice(14);
    } else if (record.startsWith("# branch.ab ")) {
      const match = record.match(/\+([0-9]+) -([0-9]+)/);
      if (match) {
        result.ahead = Number(match[1]);
        result.behind = Number(match[2]);
      }
    } else if (record.startsWith("? ")) {
      result.files.push({
        path: record.slice(2),
        index: "?",
        work: "?",
        added: 0,
        deleted: 0,
      });
    } else if (record.startsWith("1 ")) {
      const match = record.match(/^1 ([^ ]+) (?:[^ ]+ ){6}(.+)$/s);
      if (match)
        result.files.push({
          path: match[2],
          index: match[1][0],
          work: match[1][1],
          added: 0,
          deleted: 0,
        });
    } else if (record.startsWith("2 ")) {
      const match = record.match(/^2 ([^ ]+) (?:[^ ]+ ){7}(.+)$/s);
      if (match) {
        result.files.push({
          path: match[2],
          previousPath: records[++i],
          index: match[1][0],
          work: match[1][1],
          added: 0,
          deleted: 0,
        });
      }
    } else if (record.startsWith("u ")) {
      const match = record.match(/^u ([^ ]+) (?:[^ ]+ ){9}(.+)$/s);
      if (match)
        result.files.push({
          path: match[2],
          index: "U",
          work: "U",
          added: 0,
          deleted: 0,
        });
    }
  }
  return result;
}

export function parseNumstat(output) {
  const counts = new Map();
  for (const record of output.split("\0")) {
    const match = record.match(/^(\d+|-)\t(\d+|-)\t(.+)$/s);
    if (!match) continue;
    const previous = counts.get(match[3]) || { added: 0, deleted: 0 };
    previous.added += Number(match[1]) || 0;
    previous.deleted += Number(match[2]) || 0;
    counts.set(match[3], previous);
  }
  return counts;
}
