/* global log */

var cls = require('../../../../lib/class'),
    CombatQueue = require('./combatqueue'),
    Utils = require('../../../../util/utils'),
    Formulas = require('../../../formulas'),
    _ = require('underscore'),
    Hit = require('./hit'),
    Modules = require('../../../../util/modules'),
    Messages = require('../../../../network/messages'),
    Packets = require('../../../../network/packets');

/**
 * Author: Tachyon
 * Company: uDeva 2017
 */

module.exports = Combat = cls.Class.extend({

    init: function(character) {
        var self = this;

        self.character = character;
        self.world = null;

        self.attackers = {};

        self.retaliate = false;

        self.queue = new CombatQueue();

        self.attacking = false;

        self.attackLoop = null;
        self.followLoop = null;
        self.checkLoop = null;

        self.first = false;
        self.started = false;
        self.lastAction = -1;
        self.lastHit = -1;

        self.lastActionThreshold = 7000;

        self.cleanTimeout = null;

        self.character.onSubAoE(function(radius, hasTerror) {

            self.dealAoE(radius, hasTerror);

        });

        self.character.onDamage(function(target, hitInfo) {

            if (self.isPlayer() && self.character.hasBreakableWeapon() && Formulas.getWeaponBreak(self.character, target))
                self.character.breakWeapon();

            if (hitInfo.type === Modules.Hits.Stun) {

                target.setStun(true);

                if (target.stunTimeout)
                    clearTimeout(target.stunTimeout);

                target.stunTimeout = setTimeout(function() {

                    target.setStun(false);

                }, 3000);
            }
        });
    },

    begin: function(attacker) {
        var self = this;

        self.start();

        self.character.setTarget(attacker);
        self.addAttacker(attacker);

        attacker.combat.addAttacker(self.character); //For mobs attacking players..

        self.attack(attacker);
    },

    start: function() {
        var self = this;

        if (self.started)
            return;

        self.lastAction = new Date().getTime();

        self.attackLoop = setInterval(function() { self.parseAttack(); }, self.character.attackRate);

        self.followLoop = setInterval(function() { self.parseFollow(); }, 400);

        self.checkLoop = setInterval(function() {

            if (self.getTime() - self.lastAction > self.lastActionThreshold) {

                self.stop();

                self.forget();

            }

        }, 1000);

        self.started = true;
    },

    stop: function() {
        var self = this;

        if (!self.started)
            return;

        clearInterval(self.attackLoop);
        clearInterval(self.followLoop);
        clearInterval(self.checkLoop);

        self.attackLoop = null;
        self.followLoop = null;
        self.checkLoop = null;

        self.started = false;
    },

    parseAttack: function() {
        var self = this;

        if (!self.world || !self.queue || self.character.stunned)
            return;

        if (self.character.hasTarget() && self.inProximity()) {

            if (self.queue.hasQueue())
                self.hit(self.character, self.character.target, self.queue.getHit());

            if (self.character.target && !self.character.target.isDead())
                self.attack(self.character.target);

            self.lastAction = self.getTime();

        } else
            self.queue.clear();

    },

    parseFollow: function() {
        var self = this;

        if (self.character.frozen || self.character.stunned)
            return;

        if (self.isMob()) {

            if (!self.character.isRanged())
                self.sendFollow();

            if (self.isAttacked() || self.character.hasTarget())
                self.lastAction = self.getTime();

            if (self.onSameTile()) {
                var newPosition = self.getNewPosition();

                self.move(self.character, newPosition.x, newPosition.y);
            }

            if (self.character.hasTarget() && !self.inProximity()) {
                var attacker = self.getClosestAttacker();

                if (attacker)
                    self.follow(self.character, attacker);

            }
        }
    },

    attack: function(target) {
        var self = this,
            hit;

        if (self.isPlayer())
            hit = self.character.getHit(target);
        else
            hit = new Hit(Modules.Hits.Damage, Formulas.getDamage(self.character, target));

        if (!hit)
            return;

        self.queue.add(hit);
    },

    dealAoE: function(radius, hasTerror) {
        var self = this;

        /**
         * TODO - Find a way to implement special effects without hardcoding them.
         */

        if (!self.world)
            return;

        var entities = self.world.getGrids().getSurroundingEntities(self.character, radius);

        _.each(entities, function(entity) {

            var hitData = new Hit(Modules.Hits.Damage, Formulas.getAoEDamage(self.character, entity)).getData();

            hitData.isAoE = true;
            hitData.hasTerror = hasTerror;

            self.hit(self.character, entity, hitData);

        });

    },

    forceAttack: function() {
        var self = this;

        if (!self.character.target || !self.inProximity())
            return;

        self.stop();
        self.start();

        self.attackCount(2, self.character.target);
        self.hit(self.character, self.character.target, self.queue.getHit());
    },

    attackCount: function(count, target) {
        var self = this;

        for (var i = 0; i < count; i++)
            self.attack(target);
    },

    addAttacker: function(character) {
        var self = this;

        if (self.hasAttacker(character))
            return;

        self.attackers[character.instance] = character;
    },

    removeAttacker: function(character) {
        var self = this;

        if (self.hasAttacker(character))
            delete self.attackers[character.instance];

        if (!self.isAttacked())
            self.sendToSpawn();
    },

    sendToSpawn: function() {
        var self = this;

        if (!self.isMob())
            return;

        self.character.return();

        self.world.pushBroadcast(new Messages.Movement(Packets.MovementOpcode.Move, [self.character.instance, self.character.x, self.character.y, false, false]));

    },

    hasAttacker: function(character) {
        var self = this;

        if (!self.isAttacked())
            return;

        return character.instance in self.attackers;
    },

    onSameTile: function() {
        var self = this;

        if (!self.character.target || self.character.type !== 'mob')
            return;

        return self.character.x === self.character.target.x && self.character.y === self.character.target.y;
    },

    isAttacked: function() {
        return this.attackers && Object.keys(this.attackers).length > 0;
    },

    getNewPosition: function() {
        var self = this,
            position = {
                x: self.character.x,
                y: self.character.y
            };

        var random = Utils.randomInt(0, 3);

        if (random === 0)
            position.x++;
        else if (random === 1)
            position.y--;
        else if (random === 2)
            position.x--;
        else if (random === 3)
            position.y++;

        return position;
    },

    isRetaliating: function() {
        return this.isPlayer() && !this.character.hasTarget() && this.retaliate && !this.character.moving && new Date().getTime() - this.character.lastMovement > 1500;
    },

    inProximity: function() {
        var self = this;

        if (!self.character.target)
            return;

        var targetDistance = self.character.getDistance(self.character.target),
            range = self.character.attackRange;

        if (self.character.isRanged())
            return targetDistance <= range;

        return self.character.isNonDiagonal(self.character.target);
    },

    getClosestAttacker: function() {
        var self = this,
            closest = null,
            lowestDistance = 100;

        self.forEachAttacker(function(attacker) {
            var distance = self.character.getDistance(attacker);

            if (distance < lowestDistance)
                closest = attacker;
        });

        return closest;
    },

    setWorld: function(world) {
        var self = this;

        if (!self.world)
            self.world = world;
    },

    forget: function() {
        var self = this;

        self.attackers = {};
        self.character.removeTarget();

        if (self.forgetCallback)
            self.forgetCallback();
    },

    move: function(character, x, y) {
        var self = this;

        /**
         * The server and mob types can parse the mob movement
         */

        if (character.type !== 'mob')
            return;

        character.move(x, y);
    },

    hit: function(character, target, hitInfo) {
        var self = this,
            time = self.getTime();

        if (time - self.lastHit < self.character.attackRate && !hitInfo.isAoE)
            return;

        if (character.isRanged() || hitInfo.isRanged) {

            var projectile = self.world.createProjectile([character, target], hitInfo);

            self.world.pushToAdjacentGroups(character.group, new Messages.Projectile(Packets.ProjectileOpcode.Create, projectile.getData()));

        } else {

            self.world.pushBroadcast(new Messages.Combat(Packets.CombatOpcode.Hit, character.instance, target.instance, hitInfo));
            self.world.handleDamage(character, target, hitInfo.damage);

        }

        if (character.damageCallback)
            character.damageCallback(target, hitInfo);

        self.lastHit = self.getTime();
    },

    follow: function(character, target) {
        this.world.pushBroadcast(new Messages.Movement(Packets.MovementOpcode.Follow, [character.instance, target.instance, character.isRanged(), character.attackRange]));
    },

    end: function() {
        this.world.pushBroadcast(new Messages.Combat(Packets.CombatOpcode.Finish, this.character.instance, null));
    },

    sendFollow: function() {
        var self = this;

        if (!self.character.hasTarget() || self.character.target.isDead())
            return;

        var ignores = [self.character.instance, self.character.target.instance];

        self.world.pushSelectively(new Messages.Movement(Packets.MovementOpcode.Follow, [self.character.instance, self.character.target.instance]), ignores);
    },

    forEachAttacker: function(callback) {
        _.each(this.attackers, function(attacker) {
            callback(attacker);
        });
    },

    onForget: function(callback) {
        this.forgetCallback = callback;
    },

    targetOutOfBounds: function() {
        var self = this;

        if (!self.character.hasTarget() || !self.isMob())
            return;

        var spawnPoint = self.character.spawnLocation,
            target = self.character.target;

        return Utils.getDistance(spawnPoint[0], spawnPoint[1], target.x, target.y) > self.character.spawnDistance;
    },
    
    getTime: function() {
        return new Date().getTime();
    },

    colliding: function(x, y) {
        return this.world.map.isColliding(x, y);
    },

    isPlayer: function() {
        return this.character.type === 'player'
    },

    isMob: function() {
        return this.character.type === 'mob';
    },

    isTargetMob: function() {
        return this.character.target.type === 'mob';
    },

    canAttackAoE: function(target) {
        return this.isMob() || target.type === 'mob' || (this.isPlayer() && target.type === 'player' && target.pvp && this.character.pvp);
    }

});