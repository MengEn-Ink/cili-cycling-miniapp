'use strict';

const DEFAULT_PAGE_SIZE = 100;

async function readAllOrdered(baseQuery, pageSize = DEFAULT_PAGE_SIZE) {
  const values = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await baseQuery.orderBy('_id', 'asc').skip(offset).limit(pageSize).get();
    const page = Array.isArray(result?.data) ? result.data : [];
    values.push(...page);
    if (page.length < pageSize) return values;
  }
}

async function readJoinableClubDocuments(membershipQuery, clubQuery, limit = 100) {
  const memberships = await readAllOrdered(membershipQuery);
  const activeClubIds = new Set(
    memberships
      .map((membership) => membership?.club_id)
      .filter((clubId) => typeof clubId === 'string'),
  );
  const clubs = await readAllOrdered(clubQuery);
  return clubs.filter((club) => !activeClubIds.has(club?._id)).slice(0, limit);
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  readAllOrdered,
  readJoinableClubDocuments,
};
