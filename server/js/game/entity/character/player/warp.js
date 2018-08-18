var cls = require('../../../../lib/class'),
    Modules = require('../../../../util/modules'),
    Utils = require('../../../../util/utils');

module.exports = Warp = cls.Class.extend({

    init: function(player) {
        var self = this;

        self.player = player;

        self.lastWarp = 0;
        self.warpTimeout = 300000;
    },

    warp: function(id) {
        var self = this;

        if (!self.isCooldown()) {
            self.player.notify('You must wait another ' + self.getDuration() + ' to warp.');
            return;
        }

        var data = Modules.Warps[id];

        if (!data)
            return;

        var name = data[0],
            x = data[3] ? data[1] + Utils.randomInt(0, 1) : data[1],
            y = data[3] ? data[2] + Utils.randomInt(0, 1) : data[2],
            levelRequirement = data[4];

        log.info('Player Rights: ' + self.player.rights);

        if (self.hasRequirement()) {
            self.player.notify('You must be at least level ' + levelRequirement + ' to warp here!');
            return;
        }

        self.player.teleport(x, y, false, true);

        self.player.notify('You have been warped to ' + name);

        self.lastWarp = new Date().getTime();
    },

    setLastWarp: function(lastWarp) {
        var self = this;

        if (isNaN(lastWarp)) {
            self.lastWarp = 0;
            self.player.save();
        } else
            self.lastWarp = lastWarp;

    },

    isCooldown: function() {
        return this.getDifference() > this.warpTimeout || this.player.rights > 1;
    },

    hasRequirement: function(levelRequirement) {
        return this.player.level < levelRequirement || !this.player.rights > 1;
    },

    getDuration: function() {
        var self = this,
            difference = this.warpTimeout - self.getDifference();

        if (!difference)
            return '5 minutes';

        return difference > 60000 ? Math.ceil(difference / 60000) + ' minutes' : Math.floor(difference / 1000) + ' seconds';
    },

    getDifference: function() {
        return new Date().getTime() - this.lastWarp;
    }

});