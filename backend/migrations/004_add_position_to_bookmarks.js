exports.up = function(knex) {
  return knex.schema.alterTable('bookmarks', function(table) {
    table.integer('position').defaultTo(0).after('encrypted_data');
    table.index('position');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('bookmarks', function(table) {
    table.dropColumn('position');
  });
};
